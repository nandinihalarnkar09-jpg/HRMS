/**
 * IST date helpers (R-ATT-01, ARCHITECTURE.md §8).
 *
 * Rules:
 *  - Calendar dates are 'YYYY-MM-DD' strings (ISODate). Arithmetic is done in UTC so the
 *    host machine's time zone can never shift a date.
 *  - "Now" questions (today, time of check-in) are always answered in Asia/Kolkata via Intl.
 */
export type ISODate = string; // 'YYYY-MM-DD'

export const IST_TZ = 'Asia/Kolkata';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function toInstant(v: Date | string | number): Date {
  return v instanceof Date ? v : new Date(v);
}

/** IST calendar date of an instant. */
export function istDateOf(instant: Date | string | number): ISODate {
  return dateFmt.format(toInstant(instant)); // en-CA → 2026-10-25
}

/** Today in IST. */
export function todayIST(now: Date = new Date()): ISODate {
  return istDateOf(now);
}

/** 'HH:MM:SS' wall-clock time in IST. */
export function istTimeOf(instant: Date | string | number): string {
  return timeFmt.format(toInstant(instant));
}

/** Build an instant from an IST date + 'HH:MM' or 'HH:MM:SS'. */
export function istInstant(date: ISODate, time: string): Date {
  const t = time.length === 5 ? `${time}:00` : time;
  if (!isValidISODate(date) || !/^\d{2}:\d{2}:\d{2}$/.test(t)) {
    throw new Error(`Invalid IST date/time: ${date} ${time}`);
  }
  return new Date(`${date}T${t}+05:30`);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parts(d: ISODate): [number, number, number] {
  if (!isValidISODate(d)) throw new Error(`Invalid date: ${d}`);
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUTC(d: ISODate): number {
  const [y, m, day] = parts(d);
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * 86_400_000);
}

/** 0 = Sunday … 6 = Saturday (same convention as locations.weekly_off_days). */
export function weekdayOf(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO strings sort lexicographically
}

export function maxDate(a: ISODate, b: ISODate): ISODate { return a > b ? a : b; }
export function minDate(a: ISODate, b: ISODate): ISODate { return a < b ? a : b; }

/** Inclusive day count between two dates. */
export function daysInclusive(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000) + 1;
}

/** Every date from..to inclusive. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function yearOf(d: ISODate): number { return parts(d)[0]; }
export function monthOf(d: ISODate): number { return parts(d)[1]; }
export function dayOf(d: ISODate): number { return parts(d)[2]; }

export function monthStart(year: number, month: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEnd(year: number, month: number): ISODate {
  return fromUTC(Date.UTC(year, month, 0)); // day 0 of next month
}

export function yearStart(year: number): ISODate { return `${year}-01-01`; }
export function yearEnd(year: number): ISODate { return `${year}-12-31`; }

/** Hours between two instants (decimal). */
export function hoursBetween(a: Date | string, b: Date | string): number {
  return (toInstant(b).getTime() - toInstant(a).getTime()) / 3_600_000;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function weekdayName(d: ISODate): string { return WEEKDAY_SHORT[weekdayOf(d)]; }
export function monthName(month: number): string { return MONTH_LONG[month - 1]; }

/** 'Sun 25 Oct 2026' (pure string formatting; no time zone involved). */
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = parts(d);
  return `${weekdayName(d)} ${day} ${MONTH_SHORT[m - 1]} ${y}`;
}

/** '25 Oct' */
export function formatDateShort(d: ISODate): string {
  const [, m, day] = parts(d);
  return `${day} ${MONTH_SHORT[m - 1]}`;
}

/** '09:02' IST, or '—'. */
export function formatTimeIST(instant: Date | string | null | undefined): string {
  if (!instant) return '—';
  return istTimeOf(instant).slice(0, 5);
}

/** '25 Oct 2026, 09:02 IST' */
export function formatDateTimeIST(instant: Date | string | null | undefined): string {
  if (!instant) return '—';
  const d = istDateOf(instant);
  const [y, m, day] = parts(d);
  return `${day} ${MONTH_SHORT[m - 1]} ${y}, ${formatTimeIST(instant)} IST`;
}
