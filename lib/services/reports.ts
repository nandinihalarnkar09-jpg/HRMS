/**
 * L8: month-end summary for the payroll vendor. Built from buildDayResults → summariseMonth,
 * the same code path as the attendance calendar. No statutory data appears in it.
 */
import { getDb } from '@/lib/db';
import { ValidationError, type Actor } from '@/lib/core/authz';
import { monthEnd, monthStart, todayIST, monthName } from '@/lib/core/dates';
import { summariseMonth, toCsv, type MonthSummary } from '@/lib/core/summary';
import { getLeaveTypes, teamScope, type EmployeeCore } from './common';
import { buildDayResults } from './day-results';

export type SummaryRow = { employee: Pick<EmployeeCore, 'id' | 'employee_code' | 'full_name' | 'location_name' | 'department_name'>; summary: MonthSummary };

export async function monthEndSummary(actor: Actor, year: number, month: number): Promise<{ rows: SummaryRow[]; leaveCodes: string[]; label: string }> {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new ValidationError('Pick a valid month.');
  const from = monthStart(year, month);
  if (from > todayIST()) throw new ValidationError('That month has not started yet.');
  const to = monthEnd(year, month);
  const q = getDb();
  const team = await teamScope(q, actor, { from, to }); // manager: own team; HR: all
  const map = await buildDayResults(q, team, from, to);
  const leaveCodes = (await getLeaveTypes(q)).filter((t) => t.accrualMethod !== 'NONE').map((t) => t.code);
  return {
    label: `${monthName(month)} ${year}`,
    leaveCodes,
    rows: team.map((e) => ({ employee: e, summary: summariseMonth(map.get(e.id)!) })),
  };
}

export async function monthEndCsv(actor: Actor, year: number, month: number): Promise<{ filename: string; csv: string }> {
  const { rows, leaveCodes } = await monthEndSummary(actor, year, month);
  const header = ['Employee code', 'Name', 'Location', 'Department', 'Days present', 'WFH days',
    ...leaveCodes.map((c) => `${c} days`), 'LOP days', 'Holidays', 'Weekly offs', 'Late marks', 'Late penalty (LOP)', 'Missed punches'];
  const body = rows.map(({ employee: e, summary: s }) => [
    e.employee_code, e.full_name, e.location_name, e.department_name, s.daysPresent, s.wfhDays,
    ...leaveCodes.map((c) => s.leaveByType[c] ?? 0), s.lopDays, s.holidays, s.weeklyOffs, s.lateCount, s.latePenalty, s.missedPunches,
  ]);
  return { filename: `lehar-month-end-${year}-${String(month).padStart(2, '0')}.csv`, csv: toCsv(header, body) };
}

/** Extra agent tool data: employees with ≥3 Late marks or any missed punch this month (HR only). */
export async function monthEndExceptions(actor: Actor, year: number, month: number) {
  if (!actor.isHrAdmin) throw new ValidationError('Only HR Admin can run the month-end check.');
  const { rows } = await monthEndSummary(actor, year, month);
  return rows
    .filter((r) => r.summary.lateCount >= 3 || r.summary.missedPunches > 0)
    .map((r) => ({ employee_code: r.employee.employee_code, name: r.employee.full_name, late_marks: r.summary.lateCount, late_penalty_lop: r.summary.latePenalty, missed_punches: r.summary.missedPunches }));
}
