/**
 * Evaluating a leave application (R-LV-04 … R-LV-10, R-LV-14 … R-LV-16, R-LV-18).
 * Pure: the service passes in the calendar, balance and "today"; this returns the verdict.
 * The SAME function serves the live preview, the submit, the approval re-check and the agent.
 */
import { countLeaveDays, type LocationCalendar } from './calendar';
import { addDays, formatDate, isValidISODate, yearOf, type ISODate } from './dates';
import type { Balance, LeaveTypeRule } from './leave-balance';
import { splitPaidLop } from './leave-split';

export type LeaveEvaluation = {
  ok: boolean;
  errors: string[];
  days: number;
  charged: { date: ISODate; portion: number }[];
  excluded: { date: ISODate; reason: 'WEEKLY_OFF' | 'HOLIDAY'; name: string }[];
  paidDays: number;
  lopDays: number;
  needsCertificate: boolean;
  /** Set when the request exceeds the balance: what conversion to LOP would look like. */
  lopOffer: { paidDays: number; lopDays: number } | null;
};

export const MAX_BACKDATE_DAYS = 30;

/** R-LV-19: which half of the day a half-day leave covers (T5: no Late after first-half leave). */
export const HALF_DAY_SESSIONS = ['FIRST', 'SECOND'] as const;
export type HalfDaySession = (typeof HALF_DAY_SESSIONS)[number];
export const HALF_DAY_SESSION_LABEL: Record<HalfDaySession, string> = {
  FIRST: 'First half (morning)',
  SECOND: 'Second half (afternoon)',
};
export function isHalfDaySession(v: unknown): v is HalfDaySession {
  return v === 'FIRST' || v === 'SECOND';
}
/**
 * Did the user say WHICH half (English / Hindi / Hinglish)? The agent may only fill a slot the user named;
 * otherwise it must ask (R-LV-19). Returns the slot, or null when the text doesn't say.
 */
export function slotMentioned(text: string): HalfDaySession | null {
  const t = ` ${text.toLowerCase()} `;
  const first = /(first|1st|morning|forenoon|\bam\b|pehl[aei]|pahl[aei]|subah|subha|savere|before lunch|pre-?lunch)/.test(t);
  const second = /(second|2nd|afternoon|evening|post-?lunch|after lunch|\bpm\b|dusr[aei]|doosr[aei]|dopahar|dopeher|shaam|sham\b|lunch ke baad)/.test(t);
  if (first === second) return null; // neither, or both (ambiguous)
  return first ? 'FIRST' : 'SECOND';
}

/** e.g. 'Half day · first half (morning)'; plain 'Half day' for older requests with no slot. */
export function halfDayLabel(session: string | null | undefined): string {
  return isHalfDaySession(session) ? `Half day · ${HALF_DAY_SESSION_LABEL[session].toLowerCase()}` : 'Half day';
}

export function evaluateLeaveRequest(args: {
  type: LeaveTypeRule;
  from: string;
  to: string;
  halfDay: boolean;
  /** Required when halfDay is true (R-LV-19). */
  halfDaySession?: string | null;
  reason: string;
  today: ISODate;
  employee: { doj: ISODate; lwd: ISODate | null; gender: string };
  calendar: LocationCalendar;
  balance: Balance;
  hasCertificate: boolean;
  acceptLop: boolean;
}): LeaveEvaluation {
  const { type, from, to, halfDay, reason, today, employee, calendar, balance, hasCertificate, acceptLop } = args;
  const errors: string[] = [];
  const empty: LeaveEvaluation = {
    ok: false, errors, days: 0, charged: [], excluded: [], paidDays: 0, lopDays: 0, needsCertificate: false, lopOffer: null,
  };

  if (!isValidISODate(from) || !isValidISODate(to)) {
    errors.push('Pick valid from and to dates.');
    return empty;
  }
  if (to < from) {
    errors.push('The to-date cannot be before the from-date.');
    return empty;
  }
  // R-LV-09
  if (from < addDays(today, -MAX_BACKDATE_DAYS)) {
    errors.push(`Leave cannot be applied more than ${MAX_BACKDATE_DAYS} days in the past (earliest allowed: ${formatDate(addDays(today, -MAX_BACKDATE_DAYS))}).`);
  }
  // R-LV-18: one leave year per request
  if (yearOf(from) !== yearOf(to)) {
    errors.push('A request cannot cross 31 December. Apply for each leave year separately.');
  }
  // R-LV-10: within employment
  if (from < employee.doj) errors.push(`Leave cannot start before your date of joining (${formatDate(employee.doj)}).`);
  if (employee.lwd && to > employee.lwd) errors.push(`Leave cannot go beyond your last working day (${formatDate(employee.lwd)}).`);
  // R-LV-05
  if (halfDay && !type.halfDayAllowed) errors.push(`${type.name} cannot be taken as a half day.`);
  if (halfDay && from !== to) errors.push('A half day must be a single date (from-date = to-date).');
  // R-LV-19
  if (halfDay && type.halfDayAllowed && from === to && !isHalfDaySession(args.halfDaySession)) {
    errors.push('Choose which half of the day: first half (morning) or second half (afternoon).');
  }
  // R-LV-14 / R-LV-15
  if (type.eligibleGender && employee.gender !== type.eligibleGender) {
    errors.push(`${type.name} is available only to employees recorded as ${type.eligibleGender.toLowerCase()}. Contact HR if your record is wrong.`);
  }
  if (reason.trim().length < 3) errors.push('Please give a short reason.');

  // R-LV-04: working days only (calendar days for Maternity, D-5)
  const count = countLeaveDays({ from, to, halfDay: halfDay && type.halfDayAllowed && from === to, calendar, countsCalendarDays: type.countsCalendarDays });
  const days = count.days;
  if (days <= 0 && errors.length === 0) {
    errors.push('There are no working days in this range (only weekly offs and holidays), so no leave is needed.');
  }

  // Per-event entitlement (Maternity 182 calendar days / Paternity 5 working days)
  if (type.perEventDays !== null && days > type.perEventDays) {
    errors.push(`${type.name} allows at most ${type.perEventDays} days per event; this request is ${days} days.`);
  }

  // R-LV-08
  const needsCertificate = type.certRequiredAfterDays !== null && days > type.certRequiredAfterDays;
  if (needsCertificate && !hasCertificate) {
    errors.push(`${type.name} of more than ${type.certRequiredAfterDays} days needs a medical certificate (PDF, JPG or PNG, max 2 MB).`);
  }

  // Balance (R-LV-06 / R-LV-07)
  let paidDays = days;
  let lopDays = 0;
  let lopOffer: LeaveEvaluation['lopOffer'] = null;
  if (type.accrualMethod === 'NONE') {
    paidDays = 0; lopDays = days; // a Loss-of-Pay request is all LOP
  } else if (type.requiresBalance && balance.canApply !== null && days > 0) {
    if (days > balance.canApply) {
      const split = splitPaidLop(days, balance.canApply, type.halfDayAllowed);
      lopOffer = split;
      if (acceptLop) {
        paidDays = split.paidDays; lopDays = split.lopDays;
      } else {
        errors.push(
          `You can apply for at most ${Math.max(0, balance.canApply)} ${type.code} (available ${balance.available}, pending ${balance.pending}). ` +
          `Convert the extra ${split.lopDays} day(s) to Loss of Pay?`,
        );
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    days,
    charged: count.charged,
    excluded: count.excluded,
    paidDays,
    lopDays,
    needsCertificate,
    lopOffer,
  };
}

/** R-LV-13: cancellable if pending, or approved and not yet started (start date after today IST). */
export function canCancel(status: string, from: ISODate, today: ISODate): boolean {
  if (status === 'PENDING') return true;
  if (status === 'APPROVED') return from > today;
  return false;
}
