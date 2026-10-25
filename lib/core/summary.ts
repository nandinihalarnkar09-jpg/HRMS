/**
 * Month-end summary for the payroll vendor (L8). Built ONLY from computeDayStatus results,
 * so the CSV always agrees with the attendance calendar.
 */
import { latePenaltyDays, type DayResult } from './day-status';
import { round2 } from './leave-split';

/** A Late mark counts only on a day the person actually worked (or is working today). */
export function countsAsLate(r: DayResult): boolean {
  if (!r.isLate) return false;
  return r.status === 'PRESENT' || r.status === 'HALF_DAY' || r.status === 'IN_PROGRESS' || (r.status === 'ON_LEAVE' && r.units.present > 0);
}

export type MonthSummary = {
  daysPresent: number;      // includes WFH and half days (0.5)
  wfhDays: number;
  leaveByType: Record<string, number>;
  lopDays: number;          // absences + LOP leave + late penalty
  lateCount: number;
  latePenalty: number;
  holidays: number;
  weeklyOffs: number;
  missedPunches: number;
  calendarDays: number;     // days employed in the month
};

export function summariseMonth(days: DayResult[]): MonthSummary {
  const s: MonthSummary = {
    daysPresent: 0, wfhDays: 0, leaveByType: {}, lopDays: 0, lateCount: 0, latePenalty: 0,
    holidays: 0, weeklyOffs: 0, missedPunches: 0, calendarDays: 0,
  };
  for (const r of days) {
    if (r.status === 'NOT_EMPLOYED') continue;
    s.calendarDays += 1;
    s.daysPresent += r.units.present;
    s.wfhDays += r.units.wfh;
    s.lopDays += r.units.lop;
    s.holidays += r.units.holiday;
    s.weeklyOffs += r.units.weeklyOff;
    for (const [code, n] of Object.entries(r.units.leave)) s.leaveByType[code] = (s.leaveByType[code] ?? 0) + n;
    if (countsAsLate(r)) s.lateCount += 1;
    if (r.missedPunch) s.missedPunches += 1;
  }
  s.latePenalty = latePenaltyDays(s.lateCount);
  s.lopDays = round2(s.lopDays + s.latePenalty);
  s.daysPresent = round2(s.daysPresent);
  s.wfhDays = round2(s.wfhDays);
  for (const k of Object.keys(s.leaveByType)) s.leaveByType[k] = round2(s.leaveByType[k]);
  return s;
}

/** RFC 4180 CSV cell. Also neutralises spreadsheet formula injection (=,+,-,@). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
