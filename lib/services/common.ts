/**
 * Shared loaders used by several services. Everything here takes a Queryable so it can run
 * inside or outside a transaction.
 */
import type { Queryable } from '@/lib/db';
import { pgArray } from '@/lib/db';
import type { LocationCalendar, Holiday } from '@/lib/core/calendar';
import type { LeaveTypeRule, AccrualMethod } from '@/lib/core/leave-balance';
import { ForbiddenError, type Actor } from '@/lib/core/authz';

export type EmployeeCore = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  gender: string;
  date_of_joining: string;
  last_working_day: string | null;
  location_id: number;
  location_name: string;
  department_id: number;
  department_name: string;
  designation: string;
  reporting_manager_id: string | null;
  is_hr_admin: boolean;
};

const CORE_COLS = `
  e.id, e.employee_code, e.full_name, e.email, e.gender, e.date_of_joining, e.last_working_day,
  e.location_id, l.name as location_name, e.department_id, d.name as department_name, e.designation,
  e.reporting_manager_id, e.is_hr_admin`;
const CORE_FROM = `from employees e join locations l on l.id = e.location_id join departments d on d.id = e.department_id`;

export async function getEmployeeCore(q: Queryable, id: string): Promise<EmployeeCore | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q.query<EmployeeCore>(`select ${CORE_COLS} ${CORE_FROM} where e.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getEmployeesCore(q: Queryable, ids: string[]): Promise<EmployeeCore[]> {
  if (ids.length === 0) return [];
  return q.query<EmployeeCore>(`select ${CORE_COLS} ${CORE_FROM} where e.id = any($1::uuid[]) order by e.full_name`, [pgArray(ids)]);
}

/**
 * Employees the actor may see in TEAM views (attendance, leave calendar, reports):
 * HR → everyone; manager → direct reports; others → nobody.
 * `employedBetween` limits to people employed at some point in [from, to].
 */
export async function teamScope(q: Queryable, actor: Actor, employedBetween: { from: string; to: string }): Promise<EmployeeCore[]> {
  if (!actor.isHrAdmin && !actor.isManager) throw new ForbiddenError('Team views are for managers and HR only.');
  const params: unknown[] = [employedBetween.from, employedBetween.to];
  let where = `e.date_of_joining <= $2 and (e.last_working_day is null or e.last_working_day >= $1)`;
  if (!actor.isHrAdmin) { params.push(actor.id); where += ` and e.reporting_manager_id = $3`; }
  return q.query<EmployeeCore>(`select ${CORE_COLS} ${CORE_FROM} where ${where} order by e.full_name`, params);
}

export async function getCalendars(q: Queryable, from: string, to: string): Promise<Map<number, LocationCalendar>> {
  const locs = await q.query<{ id: number; weekly_off_days: number[] }>(`select id, weekly_off_days from locations`);
  const hols = await q.query<{ location_id: number; date: string; name: string; type: Holiday['type'] }>(
    `select location_id, date, name, type from holidays where date between $1 and $2 order by date`, [from, to]);
  const map = new Map<number, LocationCalendar>();
  for (const l of locs) map.set(l.id, { weeklyOffDays: l.weekly_off_days.map(Number), holidays: [] });
  for (const h of hols) map.get(h.location_id)?.holidays.push({ date: h.date, name: h.name, type: h.type });
  return map;
}

export async function getCalendar(q: Queryable, locationId: number, from: string, to: string): Promise<LocationCalendar> {
  const all = await getCalendars(q, from, to);
  const cal = all.get(locationId);
  if (!cal) throw new Error(`Unknown location ${locationId}`);
  return cal;
}

export type LeaveTypeRow = LeaveTypeRule & { id: number; isActive: boolean; sortOrder: number };

type LeaveTypeDb = {
  id: number; code: string; name: string; annual_quota: number | null; accrual_method: AccrualMethod;
  monthly_rate: number | null; carry_forward_max: number; half_day_allowed: boolean; requires_balance: boolean;
  counts_calendar_days: boolean; eligible_gender: 'Female' | 'Male' | null; cert_required_after_days: number | null;
  per_event_days: number | null; is_active: boolean; sort_order: number;
};

export function mapLeaveType(r: LeaveTypeDb): LeaveTypeRow {
  return {
    id: r.id, code: r.code, name: r.name, annualQuota: r.annual_quota, accrualMethod: r.accrual_method,
    monthlyRate: r.monthly_rate, carryForwardMax: Number(r.carry_forward_max), halfDayAllowed: r.half_day_allowed,
    requiresBalance: r.requires_balance, countsCalendarDays: r.counts_calendar_days, eligibleGender: r.eligible_gender,
    certRequiredAfterDays: r.cert_required_after_days, perEventDays: r.per_event_days, isActive: r.is_active, sortOrder: r.sort_order,
  };
}

export async function getLeaveTypes(q: Queryable, opts: { activeOnly?: boolean } = {}): Promise<LeaveTypeRow[]> {
  const rows = await q.query<LeaveTypeDb>(
    `select * from leave_types ${opts.activeOnly ? 'where is_active' : ''} order by sort_order, code`);
  return rows.map(mapLeaveType);
}

export function requireHr(actor: Actor) {
  if (!actor.isHrAdmin) throw new ForbiddenError('Only HR Admin can do this.');
}

export function isEmployedOn(e: Pick<EmployeeCore, 'date_of_joining' | 'last_working_day'>, date: string) {
  return e.date_of_joining <= date && (!e.last_working_day || e.last_working_day >= date);
}
