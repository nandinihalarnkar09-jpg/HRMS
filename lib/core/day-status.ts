/**
 * Day status (R-ATT-04 … R-ATT-06). ONE precedence list, used by My Attendance, Team view,
 * the dashboard and the month-end CSV, so the CSV always matches the calendar.
 */
import { nonWorkingReason, type LocationCalendar } from './calendar';
import { hoursBetween, istTimeOf, type ISODate } from './dates';
import type { HalfDaySession } from './leave-rules';

export type DayStatus =
  | 'PRESENT' | 'WFH' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKLY_OFF'
  | 'IN_PROGRESS' | 'UPCOMING' | 'NOT_EMPLOYED';

export const LATE_AFTER = '10:15:00';
export const FULL_DAY_HOURS = 8;
export const HALF_DAY_HOURS = 4;

/** R-ATT-04: late if check-in is after 10:15:00 IST. Never late on WFH. */
export function isLateCheckIn(checkIn: Date | string, isWfh = false): boolean {
  if (isWfh) return false;
  return istTimeOf(checkIn) > LATE_AFTER;
}

export type AttendanceFact = {
  checkIn: Date | string | null;
  checkOut: Date | string | null;
  isWfh: boolean;
  isLate: boolean;
};

export type LeaveFact = {
  typeCode: string;
  /** 1 for a full day, 0.5 for a half-day request */
  portion: number;
  /** portion paid by the leave type; the rest is LOP */
  paid: number;
  lop: number;
  /** Half-day leave only: which half is on leave (null for older requests). */
  session?: HalfDaySession | null;
};

const halfDetail = (l: LeaveFact) =>
  `½ day ${l.typeCode}${l.session === 'FIRST' ? ' (first half)' : l.session === 'SECOND' ? ' (second half)' : ''}`;

/** Units that the month-end summary adds up. Each day's units sum to at most 1. */
export type DayUnits = {
  present: number;      // includes WFH
  wfh: number;
  leave: Record<string, number>; // paid leave by type code
  lop: number;          // absence + leave converted to LOP + LOP leave
  holiday: number;
  weeklyOff: number;
};

export type DayResult = {
  date: ISODate;
  status: DayStatus;
  /** label for half-day leave days, e.g. 'On Leave (½ CL)' */
  detail: string | null;
  isLate: boolean;      // counts towards the late penalty only on worked days
  hoursWorked: number | null;
  missedPunch: boolean;
  holidayName: string | null;
  leaveTypeCode: string | null;
  units: DayUnits;
};

const zero = (): DayUnits => ({ present: 0, wfh: 0, leave: {}, lop: 0, holiday: 0, weeklyOff: 0 });

/** Present/Half/Absent from hours (R-ATT-05 step 6). */
export function statusFromHours(hours: number): 'PRESENT' | 'HALF_DAY' | 'ABSENT' {
  if (hours >= FULL_DAY_HOURS) return 'PRESENT';
  if (hours >= HALF_DAY_HOURS) return 'HALF_DAY';
  return 'ABSENT';
}

export function computeDayStatus(args: {
  date: ISODate;
  today: ISODate;
  doj: ISODate;
  lwd: ISODate | null;
  calendar: LocationCalendar;
  attendance: AttendanceFact | null;
  leave: LeaveFact | null; // APPROVED leave only
}): DayResult {
  const { date, today, doj, lwd, calendar, attendance: a, leave } = args;
  const base = {
    date, detail: null as string | null, isLate: false, hoursWorked: null as number | null,
    missedPunch: false, holidayName: null as string | null, leaveTypeCode: null as string | null,
  };
  const hours = a?.checkIn && a?.checkOut ? Math.round(hoursBetween(a.checkIn, a.checkOut) * 100) / 100 : null;

  // 1. Not employed
  if (date < doj || (lwd && date > lwd)) return { ...base, status: 'NOT_EMPLOYED', units: zero() };

  // 2/3. Holiday, then weekly off, at the employee's location (rule T9: these win over leave)
  const nw = nonWorkingReason(date, calendar);
  if (nw?.reason === 'HOLIDAY') return { ...base, status: 'HOLIDAY', holidayName: nw.name, hoursWorked: hours, units: { ...zero(), holiday: 1 } };
  if (nw?.reason === 'WEEKLY_OFF') return { ...base, status: 'WEEKLY_OFF', hoursWorked: hours, units: { ...zero(), weeklyOff: 1 } };

  // 4. Approved FULL-day leave wins over punches, even if the employee punched in (brief, T9)
  if (leave && leave.portion >= 1) {
    const units = zero();
    if (leave.paid > 0) units.leave[leave.typeCode] = leave.paid;
    units.lop = leave.lop;
    return { ...base, status: 'ON_LEAVE', leaveTypeCode: leave.typeCode, hoursWorked: hours, detail: leave.lop > 0 && leave.paid === 0 ? 'LOP' : null, units };
  }

  // Future
  if (date > today) {
    if (leave) return { ...base, status: 'ON_LEAVE', leaveTypeCode: leave.typeCode, detail: halfDetail(leave), units: zero() };
    return { ...base, status: 'UPCOMING', units: zero() };
  }

  // 8. Approved HALF-day leave: 0.5 leave + the other half from punches
  if (leave && leave.portion < 1) {
    const units = zero();
    if (leave.paid > 0) units.leave[leave.typeCode] = leave.paid;
    units.lop += leave.lop;
    const workedHalf = Boolean(a?.isWfh) || (hours !== null && hours >= HALF_DAY_HOURS);
    const inProgress = date === today && a?.checkIn && !a?.checkOut && !a?.isWfh;
    if (workedHalf) { units.present = 0.5; if (a?.isWfh) units.wfh = 0.5; }
    else if (!inProgress) units.lop += 0.5;
    return {
      ...base, status: 'ON_LEAVE', leaveTypeCode: leave.typeCode, hoursWorked: hours,
      // T5: arriving after 10:15 is expected when the morning (first half) is on leave
      detail: halfDetail(leave), isLate: Boolean(a?.isLate && workedHalf && leave.session !== 'FIRST'),
      missedPunch: Boolean(a?.checkIn && !a?.checkOut && date < today), units,
    };
  }

  // 5. Work from home → Present (A3)
  if (a?.isWfh) return { ...base, status: 'WFH', hoursWorked: hours, units: { ...zero(), present: 1, wfh: 1 } };

  // 6/7. Punches
  if (!a?.checkIn) {
    if (date === today) return { ...base, status: 'IN_PROGRESS', detail: 'Not checked in yet', units: zero() };
    return { ...base, status: 'ABSENT', units: { ...zero(), lop: 1 } };
  }
  if (!a.checkOut) {
    if (date === today) return { ...base, status: 'IN_PROGRESS', isLate: a.isLate, units: zero() };
    // Missed check-out on a past day → Absent until regularised
    return { ...base, status: 'ABSENT', missedPunch: true, isLate: a.isLate, units: { ...zero(), lop: 1 } };
  }
  const st = statusFromHours(hours ?? 0);
  if (st === 'PRESENT') return { ...base, status: 'PRESENT', hoursWorked: hours, isLate: a.isLate, units: { ...zero(), present: 1 } };
  if (st === 'HALF_DAY') return { ...base, status: 'HALF_DAY', hoursWorked: hours, isLate: a.isLate, units: { ...zero(), present: 0.5, lop: 0.5 } };
  return { ...base, status: 'ABSENT', hoursWorked: hours, isLate: false, units: { ...zero(), lop: 1 } };
}

/** R-ATT-06: every complete group of 3 Lates in a month = 0.5 day LOP. */
export function latePenaltyDays(lateCount: number): number {
  return Math.floor(lateCount / 3) * 0.5;
}
