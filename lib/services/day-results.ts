/**
 * Builds DayResult[] per employee for a date range from attendance + APPROVED leave + calendars.
 * Used by My Attendance, Team views, dashboard and the month-end CSV: one code path, so the
 * CSV always matches the calendar (L8).
 */
import type { Queryable } from '@/lib/db';
import { pgArray } from '@/lib/db';
import { countLeaveDays } from '@/lib/core/calendar';
import { computeDayStatus, type AttendanceFact, type DayResult, type LeaveFact } from '@/lib/core/day-status';
import { eachDay, todayIST } from '@/lib/core/dates';
import { allocateDays } from '@/lib/core/leave-split';
import { getCalendars, type EmployeeCore } from './common';

export type AttendanceRow = {
  employee_id: string; date: string; check_in: Date | null; check_out: Date | null;
  is_wfh: boolean; is_late: boolean; source: string;
};

export type DayView = DayResult & { checkIn: Date | null; checkOut: Date | null; source: string | null };

export async function buildDayResults(
  q: Queryable,
  employees: Pick<EmployeeCore, 'id' | 'date_of_joining' | 'last_working_day' | 'location_id'>[],
  from: string,
  to: string,
  today: string = todayIST(),
): Promise<Map<string, DayView[]>> {
  const out = new Map<string, DayView[]>();
  if (employees.length === 0) return out;
  const ids = pgArray(employees.map((e) => e.id));

  const calendars = await getCalendars(q, from, to);
  const att = await q.query<AttendanceRow>(
    `select employee_id, date, check_in, check_out, is_wfh, is_late, source
       from attendance where employee_id = any($1::uuid[]) and date between $2 and $3`, [ids, from, to]);
  const leaves = await q.query<{
    employee_id: string; code: string; from_date: string; to_date: string; is_half_day: boolean;
    paid_days: number; counts_calendar_days: boolean;
  }>(
    `select r.employee_id, t.code, r.from_date, r.to_date, r.is_half_day, r.paid_days, t.counts_calendar_days
       from leave_requests r join leave_types t on t.id = r.leave_type_id
      where r.employee_id = any($1::uuid[]) and r.status = 'APPROVED'
        and r.from_date <= $3 and r.to_date >= $2`, [ids, from, to]);

  const attBy = new Map<string, AttendanceRow>();
  for (const a of att) attBy.set(`${a.employee_id}|${a.date}`, a);

  // Expand each approved request into per-date leave facts. The full request range is
  // expanded (not just this window) so paid days are allocated to the earliest dates (R-LV-07).
  const leaveBy = new Map<string, LeaveFact>();
  const empById = new Map(employees.map((e) => [e.id, e]));
  const needWide = leaves.length ? await getCalendars(q,
    leaves.reduce((m, l) => (l.from_date < m ? l.from_date : m), from),
    leaves.reduce((m, l) => (l.to_date > m ? l.to_date : m), to)) : calendars;
  for (const l of leaves) {
    const e = empById.get(l.employee_id);
    if (!e) continue;
    const cal = needWide.get(e.location_id)!;
    const { charged } = countLeaveDays({ from: l.from_date, to: l.to_date, halfDay: l.is_half_day, calendar: cal, countsCalendarDays: l.counts_calendar_days });
    for (const d of allocateDays(charged, Number(l.paid_days))) {
      leaveBy.set(`${l.employee_id}|${d.date}`, { typeCode: l.code, portion: d.portion, paid: d.paid, lop: d.lop });
    }
  }

  for (const e of employees) {
    const cal = calendars.get(e.location_id)!;
    const days: DayView[] = [];
    for (const date of eachDay(from, to)) {
      const a = attBy.get(`${e.id}|${date}`) ?? null;
      const fact: AttendanceFact | null = a ? { checkIn: a.check_in, checkOut: a.check_out, isWfh: a.is_wfh, isLate: a.is_late } : null;
      const r = computeDayStatus({
        date, today, doj: e.date_of_joining, lwd: e.last_working_day, calendar: cal,
        attendance: fact, leave: leaveBy.get(`${e.id}|${date}`) ?? null,
      });
      days.push({ ...r, checkIn: a?.check_in ?? null, checkOut: a?.check_out ?? null, source: a?.source ?? null });
    }
    out.set(e.id, days);
  }
  return out;
}
