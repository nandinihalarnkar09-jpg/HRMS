/**
 * Splitting a request into paid days and LOP (R-LV-07).
 * The paid part covers the EARLIEST charged dates; the rest is LOP.
 */
import type { ISODate } from './dates';

/** Round DOWN to the leave type's granularity: 0.5 if half days are allowed, else whole days. */
export function floorToGranularity(n: number, halfDayAllowed: boolean): number {
  if (n <= 0) return 0;
  const step = halfDayAllowed ? 0.5 : 1;
  return Math.floor(n / step + 1e-9) * step;
}

/** Fix floating error: 1.25*3 etc. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SplitResult = { paidDays: number; lopDays: number };

/**
 * How many of `days` can be paid given what the employee can still apply for.
 * @param canApply available − pending (may be fractional for EL, e.g. 11.25)
 */
export function splitPaidLop(days: number, canApply: number, halfDayAllowed: boolean): SplitResult {
  const paid = Math.min(days, floorToGranularity(canApply, halfDayAllowed));
  return { paidDays: round2(paid), lopDays: round2(days - paid) };
}

export type DayAllocation = { date: ISODate; portion: number; paid: number; lop: number };

/** Allocate paid days to the earliest charged dates, the rest to LOP. */
export function allocateDays(charged: { date: ISODate; portion: number }[], paidDays: number): DayAllocation[] {
  let remaining = paidDays;
  return [...charged]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((c) => {
      const paid = Math.max(0, Math.min(c.portion, remaining));
      remaining = round2(remaining - paid);
      return { date: c.date, portion: c.portion, paid: round2(paid), lop: round2(c.portion - paid) };
    });
}
