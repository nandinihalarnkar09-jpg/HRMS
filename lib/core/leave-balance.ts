/**
 * Leave accrual and balance (R-LV-01 … R-LV-03, R-LV-06, R-LV-14 … R-LV-16).
 * Available balance is CALCULATED, never stored (decision D-2).
 */
import { dayOf, minDate, monthEnd, monthOf, yearEnd, yearOf, yearStart, type ISODate } from './dates';
import { floorToGranularity, round2 } from './leave-split';

export type AccrualMethod = 'YEAR_START_PRORATED' | 'MONTHLY' | 'ON_REQUEST' | 'NONE';

export type LeaveTypeRule = {
  code: string;
  name: string;
  annualQuota: number | null;
  accrualMethod: AccrualMethod;
  monthlyRate: number | null;
  carryForwardMax: number;
  halfDayAllowed: boolean;
  requiresBalance: boolean;
  countsCalendarDays: boolean;
  eligibleGender: 'Female' | 'Male' | null;
  certRequiredAfterDays: number | null;
  perEventDays: number | null;
};

/**
 * R-LV-02: year-start credit, pro-rated for a joiner in that year.
 * Months remaining counts the joining month if joining on or before the 15th; result rounded
 * DOWN to the nearest 0.5. A 1 July joiner gets 6/12 → CL 8 → 4, SL 7 → 3.5.
 */
export function proratedYearStartCredit(quota: number, doj: ISODate, year: number): number {
  const joinYear = yearOf(doj);
  if (joinYear < year) return quota;
  if (joinYear > year) return 0;
  const m = monthOf(doj);
  const monthsRemaining = 12 - m + (dayOf(doj) <= 15 ? 1 : 0);
  return floorToGranularity((quota * monthsRemaining) / 12, true);
}

/**
 * Rule L5 (RESEARCH.md): EL accrues per COMPLETED CALENDAR MONTH in the leave year.
 * The joining month counts only if the employee joined on the 1st; a month counts once its
 * last day has passed (is <= asOf) and the employee was still employed on that day.
 * Joins 1 Jul → Jul…Dec = 6 by 31 Dec; joins 15 Jun → Jul…Dec = 6; all year to 26 Oct → Jan…Sep = 9.
 */
export function completedCalendarMonths(doj: ISODate, lwd: ISODate | null, year: number, asOf: ISODate): number {
  if (yearOf(doj) > year) return 0;
  const first = yearOf(doj) < year ? 1 : dayOf(doj) === 1 ? monthOf(doj) : monthOf(doj) + 1;
  let end = minDate(asOf, yearEnd(year));
  if (lwd) end = minDate(end, lwd);
  if (end < yearStart(year)) return 0;
  let last = monthOf(end);
  if (end !== monthEnd(year, last)) last -= 1; // current month not finished yet
  return Math.max(0, last - first + 1);
}

/** R-LV-03 / L5: 1.25 EL per completed calendar month, capped at the annual quota. */
export function monthlyAccrual(rate: number, quota: number | null, doj: ISODate, lwd: ISODate | null, year: number, today: ISODate): number {
  const accrued = round2(completedCalendarMonths(doj, lwd, year, today) * rate);
  return quota !== null ? Math.min(accrued, quota) : accrued;
}

export type Balance = {
  code: string;
  name: string;
  opening: number;
  accrued: number;
  adjustment: number;
  used: number;
  pending: number;
  /** opening + accrued + adjustment − used. Pending does NOT reduce it (R-LV-06). */
  available: number | null;
  /** available − pending: the most that can still be applied for. null = unlimited/per event */
  canApply: number | null;
  /** per-event entitlement (Maternity/Paternity) */
  perEvent: number | null;
  unlimited: boolean;
};

export function computeBalance(args: {
  type: LeaveTypeRule;
  year: number;
  today: ISODate;
  doj: ISODate;
  lwd: ISODate | null;
  opening: number;
  adjustment: number;
  used: number;
  pending: number;
}): Balance {
  const { type, year, today, doj, lwd, opening, adjustment, used, pending } = args;
  const base = { code: type.code, name: type.name, opening, adjustment, used: round2(used), pending: round2(pending) };

  switch (type.accrualMethod) {
    case 'YEAR_START_PRORATED': {
      const accrued = proratedYearStartCredit(type.annualQuota ?? 0, doj, year);
      const available = round2(opening + accrued + adjustment - used);
      return { ...base, accrued, available, canApply: round2(available - pending), perEvent: null, unlimited: false };
    }
    case 'MONTHLY': {
      const accrued = monthlyAccrual(type.monthlyRate ?? 0, type.annualQuota, doj, lwd, year, today);
      const available = round2(opening + accrued + adjustment - used);
      return { ...base, accrued, available, canApply: round2(available - pending), perEvent: null, unlimited: false };
    }
    case 'ON_REQUEST':
      return { ...base, accrued: 0, available: null, canApply: null, perEvent: type.perEventDays, unlimited: false };
    case 'NONE':
    default:
      return { ...base, accrued: 0, available: null, canApply: null, perEvent: null, unlimited: true };
  }
}

/** R-LV-03: next year's EL opening = min(closing, carry_forward_max). CL/SL lapse (max 0). */
export function carryForward(closing: number, carryForwardMax: number): number {
  return round2(Math.max(0, Math.min(closing, carryForwardMax)));
}
