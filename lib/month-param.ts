import { monthOf, todayIST, yearOf } from '@/lib/core/dates';

/** Parse ?m=YYYY-MM (defaults to the current IST month). */
export function parseMonth(m: string | undefined): { year: number; month: number; key: string; prev: string; next: string } {
  const t = todayIST();
  let year = yearOf(t); let month = monthOf(t);
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split('-').map(Number);
    if (mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) { year = y; month = mo; }
  }
  const key = (y: number, mo: number) => `${y}-${String(mo).padStart(2, '0')}`;
  const prev = month === 1 ? key(year - 1, 12) : key(year, month - 1);
  const next = month === 12 ? key(year + 1, 1) : key(year, month + 1);
  return { year, month, key: key(year, month), prev, next };
}
