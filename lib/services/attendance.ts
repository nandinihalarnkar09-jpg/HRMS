/**
 * Attendance module (A1–A7).
 */
import { getDb, pgErrorCode } from '@/lib/db';
import { canApproveRegularisation, canRaiseRegularisationFor, ForbiddenError, NotFoundError, ValidationError, type Actor } from '@/lib/core/authz';
import { isLateCheckIn } from '@/lib/core/day-status';
import { addDays, formatDate, formatTimeIST, istDateOf, istInstant, isValidISODate, monthEnd, monthStart, todayIST } from '@/lib/core/dates';
import { getEmployeeCore, requireHr, teamScope, type EmployeeCore } from './common';
import { buildDayResults, type AttendanceRow, type DayView } from './day-results';
import { writeAudit } from './audit';
import { appUrl, sendEmail } from './email';

export const MAX_REGULARISE_DAYS = 30;

// ---------------------------------------------------------------- A1 / A3: punches (always self)

export async function getTodayRecord(actor: Actor, now = new Date()): Promise<AttendanceRow | null> {
  const rows = await getDb().query<AttendanceRow>(
    `select employee_id, date, check_in, check_out, is_wfh, is_late, source from attendance where employee_id = $1 and date = $2`,
    [actor.id, istDateOf(now)]);
  return rows[0] ?? null;
}

/** A1: one click; one row per employee per IST date (R-ATT-03); Late computed in IST (R-ATT-04). */
export async function checkIn(actor: Actor, now = new Date()): Promise<{ created: boolean; record: AttendanceRow }> {
  const q = getDb();
  const date = istDateOf(now);
  const rows = await q.query<AttendanceRow>(
    `insert into attendance (employee_id, date, check_in, is_late, source) values ($1, $2, $3, $4, 'SELF')
     on conflict (employee_id, date) do nothing
     returning employee_id, date, check_in, check_out, is_wfh, is_late, source`,
    [actor.id, date, now, isLateCheckIn(now)]);
  if (rows[0]) return { created: true, record: rows[0] };
  return { created: false, record: (await getTodayRecord(actor, now))! };
}

export async function checkOut(actor: Actor, now = new Date()): Promise<AttendanceRow> {
  const q = getDb();
  const rows = await q.query<AttendanceRow>(
    `update attendance set check_out = $3, updated_at = now()
      where employee_id = $1 and date = $2 and check_in is not null and check_out is null and check_in < $3
      returning employee_id, date, check_in, check_out, is_wfh, is_late, source`,
    [actor.id, istDateOf(now), now]);
  if (rows[0]) return rows[0];
  const existing = await getTodayRecord(actor, now);
  if (!existing?.check_in) throw new ValidationError('You have not checked in today.');
  throw new ValidationError(`You already checked out at ${formatTimeIST(existing.check_out)}.`);
}

/** A3: mark today as Work From Home → Present. Only before checking in (prevents dodging a Late mark). */
export async function markWfh(actor: Actor, now = new Date()): Promise<AttendanceRow> {
  // Rule T7: WFH can't be marked on a weekly off, holiday or full leave day
  const { day } = await getMyDay(actor, now);
  if (day.status === 'HOLIDAY' || day.status === 'WEEKLY_OFF') throw new ValidationError(`Today is a ${day.status === 'HOLIDAY' ? 'holiday' : 'weekly off'} at your location, so it cannot be marked as work from home.`);
  if (day.status === 'ON_LEAVE' && !day.detail?.startsWith('½')) throw new ValidationError('You are on approved leave today, so it cannot be marked as work from home.');
  const rows = await getDb().query<AttendanceRow>(
    `insert into attendance (employee_id, date, check_in, is_wfh, is_late, source) values ($1, $2, $3, true, false, 'SELF')
     on conflict (employee_id, date) do nothing
     returning employee_id, date, check_in, check_out, is_wfh, is_late, source`,
    [actor.id, istDateOf(now), now]);
  if (!rows[0]) throw new ValidationError('You have already checked in today, so it cannot be marked as work from home.');
  return rows[0];
}

// ---------------------------------------------------------------- A4 / A6: views

export async function getMonthForEmployee(actor: Actor, employeeId: string, year: number, month: number): Promise<{ employee: EmployeeCore; days: DayView[] }> {
  const q = getDb();
  const emp = await getEmployeeCore(q, employeeId);
  if (!emp) throw new NotFoundError();
  if (emp.id !== actor.id && !actor.isHrAdmin && emp.reporting_manager_id !== actor.id) throw new NotFoundError();
  const map = await buildDayResults(q, [emp], monthStart(year, month), monthEnd(year, month));
  return { employee: emp, days: map.get(emp.id)! };
}

export type TeamTodayRow = {
  id: string; employee_code: string; full_name: string; designation: string; location_name: string;
  status: DayView['status']; detail: string | null; checkIn: Date | null; checkOut: Date | null; isLate: boolean; leaveTypeCode: string | null;
};

/** A6: who in the team is present, on leave or absent today. Managers: direct reports only. */
export async function getTeamToday(actor: Actor, now = new Date()): Promise<TeamTodayRow[]> {
  const q = getDb();
  const today = istDateOf(now);
  const team = await teamScope(q, actor, { from: today, to: today });
  const map = await buildDayResults(q, team, today, today, today);
  return team.map((e) => {
    const d = map.get(e.id)![0];
    return {
      id: e.id, employee_code: e.employee_code, full_name: e.full_name, designation: e.designation, location_name: e.location_name,
      status: d.status, detail: d.detail, checkIn: d.checkIn, checkOut: d.checkOut, isLate: d.isLate, leaveTypeCode: d.leaveTypeCode,
    };
  });
}

export async function getTeamMonth(actor: Actor, year: number, month: number) {
  const q = getDb();
  const from = monthStart(year, month);
  const to = monthEnd(year, month);
  const team = await teamScope(q, actor, { from, to });
  const map = await buildDayResults(q, team, from, to);
  return { from, to, members: team.map((e) => ({ employee: e, days: map.get(e.id)! })) };
}

// ---------------------------------------------------------------- A5: regularisation

export type RegularisationInput = { employeeId?: string; date: string; inTime: string; outTime: string; reason: string };

export async function requestRegularisation(actor: Actor, input: RegularisationInput): Promise<string> {
  const q = getDb();
  const today = todayIST();
  const emp = await getEmployeeCore(q, input.employeeId || actor.id);
  if (!emp) throw new NotFoundError();
  if (!canRaiseRegularisationFor(actor, { id: emp.id, reportingManagerId: emp.reporting_manager_id })) throw new ForbiddenError();
  if (!isValidISODate(input.date)) throw new ValidationError('Pick the date to correct.');
  if (input.date > today) throw new ValidationError('You cannot regularise a future date.');
  if (input.date < addDays(today, -MAX_REGULARISE_DAYS)) throw new ValidationError(`Only the last ${MAX_REGULARISE_DAYS} days can be regularised.`);
  if (input.date < emp.date_of_joining) throw new ValidationError('That date is before the date of joining.');
  if (!/^\d{2}:\d{2}$/.test(input.inTime) || !/^\d{2}:\d{2}$/.test(input.outTime)) throw new ValidationError('Enter check-in and check-out times (HH:MM, IST).');
  const inAt = istInstant(input.date, input.inTime);
  const outAt = istInstant(input.date, input.outTime);
  if (outAt <= inAt) throw new ValidationError('Check-out must be after check-in.');
  if (outAt > new Date()) throw new ValidationError('Check-out time cannot be in the future.');
  if ((input.reason ?? '').trim().length < 5) throw new ValidationError('Give a reason (at least 5 characters).');
  try {
    const rows = await q.query<{ id: string }>(
      `insert into regularisation_requests (employee_id, date, requested_in, requested_out, reason, requested_by)
       values ($1,$2,$3,$4,$5,$6) returning id`, [emp.id, input.date, inAt, outAt, input.reason.trim(), actor.id]);
    // Notify the approver: the reporting manager for self-requests, HR for manager-raised ones (D-6)
    const raisedByManager = actor.id !== emp.id;
    const approvers = !raisedByManager && emp.reporting_manager_id
      ? await q.query<{ email: string; full_name: string }>(`select email, full_name from employees where id = $1`, [emp.reporting_manager_id])
      : await q.query<{ email: string; full_name: string }>(`select email, full_name from employees where is_hr_admin and id <> $1`, [emp.id]);
    for (const a of approvers) {
      await sendEmail(q, {
        to: a.email, subject: `Attendance correction: ${emp.full_name} · ${formatDate(input.date)}`,
        text: `Hi ${a.full_name},\n\n${emp.full_name} (${emp.employee_code}) needs an attendance correction for ${formatDate(input.date)}: ${input.inTime}–${input.outTime} IST.\nReason: ${input.reason}\n\nReview: ${appUrl('/approvals')}`,
        relatedId: rows[0].id,
      });
    }
    return rows[0].id;
  } catch (e) {
    if (pgErrorCode(e) === '23505') throw new ValidationError('There is already a pending correction for this date.');
    throw e;
  }
}

export type RegularisationView = {
  id: string; employee_id: string; employee_code: string; full_name: string; date: string; requested_in: Date; requested_out: Date;
  reason: string; status: string; requested_by: string; requested_by_name: string; approver_name: string | null; approver_comment: string | null;
  created_at: Date; current_in: Date | null; current_out: Date | null; reporting_manager_id: string | null;
};

const REG_SQL = `
  select g.id, g.employee_id, e.employee_code, e.full_name, g.date, g.requested_in, g.requested_out, g.reason, g.status,
         g.requested_by, rb.full_name as requested_by_name, ap.full_name as approver_name, g.approver_comment, g.created_at,
         a.check_in as current_in, a.check_out as current_out, e.reporting_manager_id
    from regularisation_requests g
    join employees e on e.id = g.employee_id
    join employees rb on rb.id = g.requested_by
    left join employees ap on ap.id = g.approver_id
    left join attendance a on a.employee_id = g.employee_id and a.date = g.date`;

export async function listMyRegularisations(actor: Actor): Promise<RegularisationView[]> {
  return getDb().query<RegularisationView>(`${REG_SQL} where g.employee_id = $1 order by g.date desc limit 50`, [actor.id]);
}

export async function listPendingRegularisations(actor: Actor): Promise<RegularisationView[]> {
  if (!actor.isHrAdmin && !actor.isManager) return [];
  const rows = await getDb().query<RegularisationView>(`${REG_SQL} where g.status = 'PENDING' order by g.date`);
  return rows.filter((r) => canApproveRegularisation(actor, { id: r.employee_id, reportingManagerId: r.reporting_manager_id }, r.requested_by));
}

/** R-ATT-07: attendance changes ONLY after approval. */
export async function decideRegularisation(actor: Actor, id: string, decision: 'APPROVED' | 'REJECTED', comment: string): Promise<void> {
  if (decision === 'REJECTED' && comment.trim().length < 3) throw new ValidationError('Please add a comment explaining the rejection.');
  const db = getDb();
  const result = await db.tx(async (q) => {
    const rows = await q.query<RegularisationView>(`${REG_SQL} where g.id = $1 for update of g`, [id]);
    const g = rows[0];
    if (!g) throw new NotFoundError();
    if (!canApproveRegularisation(actor, { id: g.employee_id, reportingManagerId: g.reporting_manager_id }, g.requested_by)) {
      throw new ForbiddenError(g.employee_id === actor.id ? 'You cannot approve your own correction.' : 'You cannot decide this request.');
    }
    if (g.status !== 'PENDING') throw new ValidationError(`Already ${g.status.toLowerCase()}.`);
    if (decision === 'APPROVED') {
      await q.query(
        `insert into attendance (employee_id, date, check_in, check_out, is_wfh, is_late, source)
         values ($1,$2,$3,$4,false,$5,'REGULARISATION')
         on conflict (employee_id, date) do update set check_in = excluded.check_in, check_out = excluded.check_out,
           is_wfh = false, is_late = excluded.is_late, source = 'REGULARISATION', updated_at = now()`,
        [g.employee_id, g.date, g.requested_in, g.requested_out, isLateCheckIn(g.requested_in)]);
      await writeAudit(q, actor.id, [{
        tableName: 'attendance', recordId: `${g.employee_id}:${g.date}`, subjectEmployeeId: g.employee_id, action: 'REGULARISATION_APPROVED',
        field: `attendance ${g.date}`, oldValue: `${formatTimeIST(g.current_in)}–${formatTimeIST(g.current_out)}`,
        newValue: `${formatTimeIST(g.requested_in)}–${formatTimeIST(g.requested_out)}`, reason: g.reason,
      }]);
    }
    await q.query(`update regularisation_requests set status = $2, approver_id = $3, approver_comment = $4, decided_at = now() where id = $1`,
      [id, decision, actor.id, comment.trim() || null]);
    return g;
  });
  const q = getDb();
  const emp = await getEmployeeCore(q, result.employee_id);
  if (emp) {
    await sendEmail(q, {
      to: emp.email, subject: `Attendance correction for ${formatDate(result.date)} was ${decision.toLowerCase()}`,
      text: `Hi ${emp.full_name},\n\nYour correction for ${formatDate(result.date)} (${formatTimeIST(result.requested_in)}–${formatTimeIST(result.requested_out)} IST) was ${decision.toLowerCase()} by ${actor.fullName}.${comment ? `\nComment: ${comment}` : ''}`,
      relatedId: id,
    });
  }
}

/** R-ATT-08: HR direct correction with a mandatory reason, audited. */
export async function hrCorrectAttendance(actor: Actor, input: { employeeId: string; date: string; inTime: string; outTime: string; isWfh?: boolean; reason: string }) {
  requireHr(actor);
  if (!input.reason || input.reason.trim().length < 5) throw new ValidationError('A reason (5+ characters) is required.');
  if (!isValidISODate(input.date) || input.date > todayIST()) throw new ValidationError('Pick a valid past date.');
  const inAt = istInstant(input.date, input.inTime);
  const outAt = istInstant(input.date, input.outTime);
  if (outAt <= inAt) throw new ValidationError('Check-out must be after check-in.');
  await getDb().tx(async (q) => {
    const old = await q.query<AttendanceRow>(`select * from attendance where employee_id = $1 and date = $2 for update`, [input.employeeId, input.date]);
    await q.query(
      `insert into attendance (employee_id, date, check_in, check_out, is_wfh, is_late, source) values ($1,$2,$3,$4,$5,$6,'HR_CORRECTION')
       on conflict (employee_id, date) do update set check_in = excluded.check_in, check_out = excluded.check_out,
         is_wfh = excluded.is_wfh, is_late = excluded.is_late, source = 'HR_CORRECTION', updated_at = now()`,
      [input.employeeId, input.date, inAt, outAt, Boolean(input.isWfh), isLateCheckIn(inAt, Boolean(input.isWfh))]);
    await writeAudit(q, actor.id, [{
      tableName: 'attendance', recordId: `${input.employeeId}:${input.date}`, subjectEmployeeId: input.employeeId,
      action: 'ATTENDANCE_CORRECTION', field: `attendance ${input.date}`,
      oldValue: old[0] ? `${formatTimeIST(old[0].check_in)}–${formatTimeIST(old[0].check_out)}${old[0].is_wfh ? ' WFH' : ''}` : 'no record',
      newValue: `${input.inTime}–${input.outTime}${input.isWfh ? ' WFH' : ''}`, reason: input.reason.trim(),
    }]);
  });
}

/** Dashboard: my status today + today's record. */
export async function getMyDay(actor: Actor, now = new Date()) {
  const q = getDb();
  const emp = await getEmployeeCore(q, actor.id);
  if (!emp) throw new NotFoundError();
  const today = istDateOf(now);
  const map = await buildDayResults(q, [emp], today, today, today);
  return { employee: emp, today, day: map.get(emp.id)![0] };
}
