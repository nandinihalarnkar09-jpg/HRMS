/**
 * Location calendar: weekly offs + holidays (R-ATT-02, R-ATT-09, R-LV-04).
 */
import { eachDay, weekdayOf, type ISODate } from './dates';

export type HolidayType = 'NATIONAL' | 'STATE' | 'OPTIONAL';
export type Holiday = { date: ISODate; name: string; type: HolidayType };

export type LocationCalendar = {
  /** 0 = Sunday … 6 = Saturday */
  weeklyOffDays: number[];
  holidays: Holiday[];
};

export type NonWorking = { reason: 'WEEKLY_OFF' | 'HOLIDAY'; name: string };

/**
 * Why a date is not a working day at this location, or null if it is a working day.
 * Holiday wins over weekly off (so a holiday on a Sunday is reported as the holiday).
 * OPTIONAL holidays are working days (decision D-7).
 */
export function nonWorkingReason(date: ISODate, cal: LocationCalendar): NonWorking | null {
  const h = cal.holidays.find((x) => x.date === date && x.type !== 'OPTIONAL');
  if (h) return { reason: 'HOLIDAY', name: h.name };
  if (cal.weeklyOffDays.includes(weekdayOf(date))) return { reason: 'WEEKLY_OFF', name: 'Weekly off' };
  return null;
}

export function isWorkingDay(date: ISODate, cal: LocationCalendar): boolean {
  return nonWorkingReason(date, cal) === null;
}

export type LeaveDayCount = {
  /** total leave days charged (working days, or calendar days for counts_calendar_days types) */
  days: number;
  /** the dates actually charged, with the portion of each (1 or 0.5) */
  charged: { date: ISODate; portion: number }[];
  /** dates inside the range that were NOT charged, and why */
  excluded: { date: ISODate; reason: NonWorking['reason']; name: string }[];
};

/**
 * Count leave days between two dates (R-LV-04, no sandwich rule).
 *  - Weekly offs and National/State holidays inside the range are never counted.
 *  - Half day only applies to a single date (R-LV-05); validated by the caller.
 *  - counts_calendar_days (Maternity, D-5) charges every calendar day.
 */
export function countLeaveDays(args: {
  from: ISODate; to: ISODate; halfDay?: boolean; calendar: LocationCalendar; countsCalendarDays?: boolean;
}): LeaveDayCount {
  const { from, to, halfDay = false, calendar, countsCalendarDays = false } = args;
  if (to < from) return { days: 0, charged: [], excluded: [] };
  const charged: LeaveDayCount['charged'] = [];
  const excluded: LeaveDayCount['excluded'] = [];
  for (const d of eachDay(from, to)) {
    const nw = countsCalendarDays ? null : nonWorkingReason(d, calendar);
    if (nw) excluded.push({ date: d, reason: nw.reason, name: nw.name });
    else charged.push({ date: d, portion: halfDay ? 0.5 : 1 });
  }
  const days = charged.reduce((s, c) => s + c.portion, 0);
  return { days, charged, excluded };
}
