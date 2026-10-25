/**
 * Settings (HR only): locations, departments, holidays, leave types, policy text.
 * listHolidays is readable by everyone for their OWN location (agent tool get_holidays).
 */
import { getDb, pgErrorCode } from '@/lib/db';
import { ValidationError, type Actor } from '@/lib/core/authz';
import { isValidISODate, monthEnd, monthStart, yearEnd, yearStart } from '@/lib/core/dates';
import { searchPolicy, type PolicyDoc } from '@/lib/core/policy-search';
import { getLeaveTypes, requireHr, type LeaveTypeRow } from './common';
import { writeAudit } from './audit';

export type LocationRow = { id: number; code: string; name: string; city: string; state: string; weekly_off_days: number[] };
export type HolidayRow = { id: number; location_id: number; location_name: string; date: string; name: string; type: 'NATIONAL' | 'STATE' | 'OPTIONAL' };

export async function listLocations(): Promise<LocationRow[]> {
  const rows = await getDb().query<LocationRow>(`select id, code, name, city, state, weekly_off_days from locations order by id`);
  return rows.map((r) => ({ ...r, weekly_off_days: r.weekly_off_days.map(Number) }));
}

export async function listDepartments() {
  return getDb().query<{ id: number; name: string; headcount: number }>(
    `select d.id, d.name, count(e.id)::int as headcount from departments d left join employees e on e.department_id = d.id group by d.id order by d.name`);
}

/** Holidays for a location and year (optionally one month). Non-HR may only ask for their own location. */
export async function listHolidays(actor: Actor, opts: { year: number; month?: number; locationId?: number | 'all' }): Promise<HolidayRow[]> {
  const loc = opts.locationId ?? actor.locationId;
  if (!actor.isHrAdmin && loc !== actor.locationId) throw new ValidationError('You can only view holidays for your own location.');
  const from = opts.month ? monthStart(opts.year, opts.month) : yearStart(opts.year);
  const to = opts.month ? monthEnd(opts.year, opts.month) : yearEnd(opts.year);
  const params: unknown[] = [from, to];
  let where = 'h.date between $1 and $2';
  if (loc !== 'all') { params.push(loc); where += ` and h.location_id = $3`; }
  return getDb().query<HolidayRow>(
    `select h.id, h.location_id, l.name as location_name, h.date, h.name, h.type from holidays h join locations l on l.id = h.location_id
      where ${where} order by h.date, l.id`, params);
}

/** A7: HR adds a holiday to one or more locations, typed National / State / Optional. */
export async function addHoliday(actor: Actor, input: { date: string; name: string; type: string; locationIds: number[] }) {
  requireHr(actor);
  if (!isValidISODate(input.date)) throw new ValidationError('Pick a date.');
  if (!input.name || input.name.trim().length < 3) throw new ValidationError('Enter the holiday name.');
  if (!['NATIONAL', 'STATE', 'OPTIONAL'].includes(input.type)) throw new ValidationError('Pick National, State or Optional.');
  if (!input.locationIds.length) throw new ValidationError('Pick at least one location.');
  await getDb().tx(async (q) => {
    for (const loc of input.locationIds) {
      try {
        await q.query(`insert into holidays (location_id, date, name, type) values ($1,$2,$3,$4)`, [loc, input.date, input.name.trim(), input.type]);
      } catch (e) {
        if (pgErrorCode(e) === '23505') throw new ValidationError('That location already has a holiday on this date.');
        throw e;
      }
    }
    await writeAudit(q, actor.id, [{ tableName: 'holidays', recordId: input.date, subjectEmployeeId: null, action: 'SETTINGS', field: 'holiday added', newValue: `${input.date} ${input.name} (${input.type}) → locations ${input.locationIds.join(',')}` }]);
  });
}

export async function deleteHoliday(actor: Actor, id: number) {
  requireHr(actor);
  await getDb().tx(async (q) => {
    const h = await q.query<{ date: string; name: string; location_id: number }>(`delete from holidays where id = $1 returning date, name, location_id`, [id]);
    if (h[0]) await writeAudit(q, actor.id, [{ tableName: 'holidays', recordId: String(id), subjectEmployeeId: null, action: 'SETTINGS', field: 'holiday removed', oldValue: `${h[0].date} ${h[0].name} (location ${h[0].location_id})` }]);
  });
}

export async function updateLocationWeeklyOffs(actor: Actor, id: number, days: number[]) {
  requireHr(actor);
  const clean = [...new Set(days.map(Number))].filter((d) => d >= 0 && d <= 6).sort();
  if (clean.length > 3) throw new ValidationError('At most 3 weekly offs.');
  await getDb().tx(async (q) => {
    const old = await q.query<{ w: number[] }>(`select weekly_off_days as w from locations where id = $1`, [id]);
    await q.query(`update locations set weekly_off_days = $2::smallint[] where id = $1`, [id, `{${clean.join(',')}}`]);
    await writeAudit(q, actor.id, [{ tableName: 'locations', recordId: String(id), subjectEmployeeId: null, action: 'SETTINGS', field: 'weekly_off_days', oldValue: JSON.stringify(old[0]?.w), newValue: JSON.stringify(clean) }]);
  });
}

export async function addLocation(actor: Actor, input: { code: string; name: string; city: string; state: string; weeklyOffDays: number[] }) {
  requireHr(actor);
  if (!/^[A-Z]{3}$/.test(input.code)) throw new ValidationError('Location code must be 3 capital letters.');
  try {
    await getDb().query(`insert into locations (code, name, city, state, weekly_off_days) values ($1,$2,$3,$4,$5::smallint[])`,
      [input.code, input.name.trim(), input.city.trim(), input.state, `{${input.weeklyOffDays.join(',')}}`]);
  } catch (e) { if (pgErrorCode(e) === '23505') throw new ValidationError('A location with this code or name exists.'); throw e; }
}

export async function addDepartment(actor: Actor, name: string) {
  requireHr(actor);
  if (!name || name.trim().length < 2) throw new ValidationError('Enter a department name.');
  try { await getDb().query(`insert into departments (name) values ($1)`, [name.trim()]); }
  catch (e) { if (pgErrorCode(e) === '23505') throw new ValidationError('That department already exists.'); throw e; }
}

export async function listLeaveTypes(): Promise<LeaveTypeRow[]> {
  return getLeaveTypes(getDb());
}

/** L1: HR configures quota, accrual, carry-forward limit, half-day flag. */
export async function updateLeaveType(actor: Actor, id: number, input: { name: string; annualQuota: number | null; accrualMethod: string; monthlyRate: number | null; carryForwardMax: number; halfDayAllowed: boolean; isActive: boolean; certRequiredAfterDays: number | null; perEventDays: number | null }) {
  requireHr(actor);
  if (!['YEAR_START_PRORATED', 'MONTHLY', 'ON_REQUEST', 'NONE'].includes(input.accrualMethod)) throw new ValidationError('Pick an accrual method.');
  if (input.accrualMethod === 'MONTHLY' && !(Number(input.monthlyRate) > 0)) throw new ValidationError('Monthly accrual needs a monthly rate.');
  if (input.annualQuota !== null && (input.annualQuota < 0 || input.annualQuota > 365)) throw new ValidationError('Quota must be between 0 and 365.');
  if (input.carryForwardMax < 0) throw new ValidationError('Carry-forward limit cannot be negative.');
  await getDb().tx(async (q) => {
    const before = (await q.query<Record<string, unknown>>(`select * from leave_types where id = $1 for update`, [id]))[0];
    if (!before) throw new ValidationError('Unknown leave type.');
    await q.query(
      `update leave_types set name=$2, annual_quota=$3, accrual_method=$4, monthly_rate=$5, carry_forward_max=$6, half_day_allowed=$7, is_active=$8,
              cert_required_after_days=$9, per_event_days=$10 where id = $1`,
      [id, input.name.trim(), input.annualQuota, input.accrualMethod, input.monthlyRate, input.carryForwardMax, input.halfDayAllowed, input.isActive, input.certRequiredAfterDays, input.perEventDays]);
    await writeAudit(q, actor.id, [{ tableName: 'leave_types', recordId: String(id), subjectEmployeeId: null, action: 'SETTINGS', field: `leave type ${before.code}`,
      oldValue: `quota ${before.annual_quota}, ${before.accrual_method}, cf ${before.carry_forward_max}, half ${before.half_day_allowed}`,
      newValue: `quota ${input.annualQuota}, ${input.accrualMethod}, cf ${input.carryForwardMax}, half ${input.halfDayAllowed}` }]);
  });
}

// ---------------------------------------------------------------- policy text (explain_policy)

export async function listPolicyDocs(): Promise<(PolicyDoc & { id: number; updated_at: Date })[]> {
  return getDb().query<PolicyDoc & { id: number; updated_at: Date }>(`select id, slug, title, body, updated_at from policy_documents order by id`);
}

export async function updatePolicyDoc(actor: Actor, id: number, body: string) {
  requireHr(actor);
  if (!body || body.trim().length < 20) throw new ValidationError('Policy text is too short.');
  await getDb().query(`update policy_documents set body = $2, updated_by = $3, updated_at = now() where id = $1`, [id, body, actor.id]);
}

/** Retrieval for the agent: ONLY stored policy text. */
export async function searchPolicyText(question: string) {
  return searchPolicy(await listPolicyDocs(), question);
}

export async function listEmailLog(actor: Actor) {
  requireHr(actor);
  return getDb().query<{ id: number; to_email: string; subject: string; status: string; error: string | null; created_at: Date }>(
    `select id, to_email, subject, status, error, created_at from email_log order by id desc limit 50`);
}

export async function listAgentLog(actor: Actor) {
  requireHr(actor);
  return getDb().query<{ id: number; full_name: string; tool: string; inputs: unknown; result: unknown; ok: boolean; created_at: Date }>(
    `select a.id, e.full_name, a.tool, a.inputs, a.result, a.ok, a.created_at from agent_log a join employees e on e.id = a.employee_id order by a.id desc limit 100`);
}
