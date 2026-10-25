/**
 * Seed data (NFR): 2 locations, 4 departments, 20 employees (1 HR Admin, 3 managers),
 * holidays for the current year, leave types, opening balances, ~2 months of attendance,
 * sample leave and regularisation requests, and the policy text the agent answers from.
 *
 * Test logins: <first>.<last>+clerk_test@<SEED_EMAIL_DOMAIN> (Clerk dev instances accept
 * code 424242 for +clerk_test addresses). Deterministic PRNG → the same data every run for a given date.
 */
import type { Db, Queryable } from '../lib/db/types';
import { addDays, eachDay, istInstant, monthStart, todayIST, yearOf, type ISODate } from '../lib/core/dates';
import { countLeaveDays, isWorkingDay, type LocationCalendar } from '../lib/core/calendar';
import { POLICY_DOCS } from './policy-text';

// ---------------------------------------------------------------- deterministic random
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261025);
const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const digits = (n: number, first = '') => first + Array.from({ length: n - first.length }, () => int(0, 9)).join('');
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + int(0, 25))).join('');
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- reference data
export const LOCATIONS = [
  { code: 'PNJ', name: 'Panaji Head Office', city: 'Panaji', state: 'Goa', weekly_off_days: [0, 6] },
  { code: 'VRN', name: 'Verna Plant', city: 'Verna', state: 'Goa', weekly_off_days: [0] },
];
export const DEPARTMENTS = ['Production', 'Quality Assurance', 'Sales & Marketing', 'HR & Finance'];

export const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', annual_quota: 8, accrual_method: 'YEAR_START_PRORATED', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, requires_balance: true, counts_calendar_days: false, eligible_gender: null, cert_required_after_days: null, per_event_days: null, sort_order: 1 },
  { code: 'SL', name: 'Sick Leave', annual_quota: 7, accrual_method: 'YEAR_START_PRORATED', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, requires_balance: true, counts_calendar_days: false, eligible_gender: null, cert_required_after_days: 2, per_event_days: null, sort_order: 2 },
  { code: 'EL', name: 'Earned Leave', annual_quota: 15, accrual_method: 'MONTHLY', monthly_rate: 1.25, carry_forward_max: 30, half_day_allowed: false, requires_balance: true, counts_calendar_days: false, eligible_gender: null, cert_required_after_days: null, per_event_days: null, sort_order: 3 },
  { code: 'ML', name: 'Maternity Leave', annual_quota: null, accrual_method: 'ON_REQUEST', monthly_rate: null, carry_forward_max: 0, half_day_allowed: false, requires_balance: false, counts_calendar_days: true, eligible_gender: 'Female', cert_required_after_days: null, per_event_days: 182, sort_order: 4 },
  { code: 'PL', name: 'Paternity Leave', annual_quota: null, accrual_method: 'ON_REQUEST', monthly_rate: null, carry_forward_max: 0, half_day_allowed: false, requires_balance: false, counts_calendar_days: false, eligible_gender: 'Male', cert_required_after_days: null, per_event_days: 5, sort_order: 5 },
  { code: 'LOP', name: 'Loss of Pay', annual_quota: null, accrual_method: 'NONE', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, requires_balance: false, counts_calendar_days: false, eligible_gender: null, cert_required_after_days: null, per_event_days: null, sort_order: 6 },
] as const;

type H = { date: string; name: string; type: 'NATIONAL' | 'STATE' | 'OPTIONAL'; only?: 'PNJ' | 'VRN' };
/** Goa 2026 list (RESEARCH.md Q6 and sources). Only gazetted days are non-working. */
const HOLIDAYS_2026: H[] = [
  { date: '2026-01-01', name: 'New Year Day', type: 'OPTIONAL' },
  { date: '2026-01-26', name: 'Republic Day', type: 'NATIONAL' },
  { date: '2026-03-03', name: 'Holi', type: 'OPTIONAL' },
  { date: '2026-04-03', name: 'Good Friday', type: 'OPTIONAL' },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti', type: 'STATE' },
  { date: '2026-05-01', name: 'May Day', type: 'STATE' },
  { date: '2026-08-15', name: 'Independence Day', type: 'NATIONAL' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'STATE' },
  { date: '2026-09-15', name: 'Ganesh Chaturthi (2nd day)', type: 'STATE', only: 'VRN' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'NATIONAL' },
  { date: '2026-10-20', name: 'Dussehra', type: 'OPTIONAL' },
  { date: '2026-11-08', name: 'Deepavali', type: 'STATE' },
  { date: '2026-12-03', name: 'Feast of St. Francis Xavier', type: 'STATE' },
  { date: '2026-12-19', name: 'Goa Liberation Day', type: 'STATE' },
  { date: '2026-12-25', name: 'Christmas', type: 'STATE' },
];
function holidaysFor(year: number): H[] {
  if (year === 2026) return HOLIDAYS_2026;
  // Other years: fixed-date holidays only; HR adds movable festivals in Settings.
  return HOLIDAYS_2026.filter((h) => ['01-01', '01-26', '04-14', '05-01', '08-15', '10-02', '12-03', '12-19', '12-25'].includes(h.date.slice(5)))
    .map((h) => ({ ...h, date: `${year}-${h.date.slice(5)}` }));
}

type Person = {
  key: string; first: string; last: string; gender: 'Female' | 'Male'; designation: string; dept: string; loc: 'PNJ' | 'VRN';
  manager: string | null; doj: string; dobYear: number; grade: string; hr?: boolean; lwd?: string; uan?: boolean;
};

export const PEOPLE: Person[] = [
  { key: 'vikram', first: 'Vikram', last: 'Sardesai', gender: 'Male', designation: 'General Manager', dept: 'HR & Finance', loc: 'PNJ', manager: null, doj: '2012-06-01', dobYear: 1975, grade: 'G7' },
  { key: 'priya', first: 'Priya', last: 'Naik', gender: 'Female', designation: 'HR Manager', dept: 'HR & Finance', loc: 'PNJ', manager: 'vikram', doj: '2016-04-11', dobYear: 1986, grade: 'G5', hr: true },
  { key: 'rohan', first: 'Rohan', last: 'Kamat', gender: 'Male', designation: 'Plant Manager', dept: 'Production', loc: 'VRN', manager: 'vikram', doj: '2014-01-06', dobYear: 1980, grade: 'G6' },
  { key: 'sneha', first: 'Sneha', last: 'Dessai', gender: 'Female', designation: 'Sales Manager', dept: 'Sales & Marketing', loc: 'PNJ', manager: 'vikram', doj: '2017-08-01', dobYear: 1985, grade: 'G5' },
  { key: 'ravi', first: 'Ravi', last: 'Gaonkar', gender: 'Male', designation: 'Machine Operator', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2019-02-18', dobYear: 1994, grade: 'G2' },
  { key: 'anita', first: 'Anita', last: 'Fernandes', gender: 'Female', designation: 'QA Analyst', dept: 'Quality Assurance', loc: 'VRN', manager: 'rohan', doj: '2020-07-01', dobYear: 1995, grade: 'G3' },
  { key: 'sanjay', first: 'Sanjay', last: 'Parab', gender: 'Male', designation: 'Line Supervisor', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2015-11-02', dobYear: 1983, grade: 'G4' },
  { key: 'meera', first: 'Meera', last: 'Kerkar', gender: 'Female', designation: 'Packing Operator', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2026-07-01', dobYear: 2003, grade: 'G1', uan: false },
  { key: 'joel', first: 'Joel', last: 'DSouza', gender: 'Male', designation: 'Maintenance Technician', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2021-03-15', dobYear: 1992, grade: 'G2' },
  { key: 'kavita', first: 'Kavita', last: 'Shirodkar', gender: 'Female', designation: 'Quality Inspector', dept: 'Quality Assurance', loc: 'VRN', manager: 'rohan', doj: '2018-09-10', dobYear: 1990, grade: 'G3' },
  { key: 'ganesh', first: 'Ganesh', last: 'Volvoikar', gender: 'Male', designation: 'Store Keeper', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2017-05-22', dobYear: 1988, grade: 'G2' },
  { key: 'pooja', first: 'Pooja', last: 'Gawas', gender: 'Female', designation: 'Production Planner', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2022-01-03', dobYear: 1997, grade: 'G3' },
  { key: 'nikhil', first: 'Nikhil', last: 'Shet', gender: 'Male', designation: 'Forklift Operator', dept: 'Production', loc: 'VRN', manager: 'rohan', doj: '2020-10-05', dobYear: 1993, grade: 'G1', lwd: 'EXITED' },
  { key: 'aditya', first: 'Aditya', last: 'Prabhu', gender: 'Male', designation: 'Sales Executive', dept: 'Sales & Marketing', loc: 'PNJ', manager: 'sneha', doj: '2021-06-14', dobYear: 1996, grade: 'G2' },
  { key: 'rhea', first: 'Rhea', last: 'Pereira', gender: 'Female', designation: 'Marketing Executive', dept: 'Sales & Marketing', loc: 'PNJ', manager: 'sneha', doj: '2022-08-01', dobYear: 1998, grade: 'G2' },
  { key: 'siddharth', first: 'Siddharth', last: 'Borkar', gender: 'Male', designation: 'Key Account Manager', dept: 'Sales & Marketing', loc: 'PNJ', manager: 'sneha', doj: '2019-12-02', dobYear: 1991, grade: 'G4' },
  { key: 'tanvi', first: 'Tanvi', last: 'Lotlikar', gender: 'Female', designation: 'Sales Coordinator', dept: 'Sales & Marketing', loc: 'PNJ', manager: 'sneha', doj: '2023-02-20', dobYear: 1999, grade: 'G2' },
  { key: 'sameer', first: 'Sameer', last: 'Kudchadkar', gender: 'Male', designation: 'Accountant', dept: 'HR & Finance', loc: 'PNJ', manager: 'vikram', doj: '2018-03-05', dobYear: 1989, grade: 'G3' },
  { key: 'neha', first: 'Neha', last: 'Chodankar', gender: 'Female', designation: 'HR Executive', dept: 'HR & Finance', loc: 'PNJ', manager: 'vikram', doj: '2023-07-17', dobYear: 2000, grade: 'G2' },
  { key: 'arjun', first: 'Arjun', last: 'Salgaocar', gender: 'Male', designation: 'Junior Accountant', dept: 'HR & Finance', loc: 'PNJ', manager: 'vikram', doj: '2026-03-16', dobYear: 2002, grade: 'G1', uan: false },
];

const BANKS = [
  { name: 'State Bank of India', ifsc: 'SBIN0' }, { name: 'HDFC Bank', ifsc: 'HDFC0' },
  { name: 'Bank of Baroda', ifsc: 'BARB0' }, { name: 'Canara Bank', ifsc: 'CNRB0' },
];

export function emailFor(p: Pick<Person, 'first' | 'last'>, domain = process.env.SEED_EMAIL_DOMAIN || 'example.com') {
  return `${p.first}.${p.last}+clerk_test@${domain}`.toLowerCase();
}

// ---------------------------------------------------------------- seed

export async function seed(db: Db, opts: { today?: ISODate; log?: (s: string) => void } = {}) {
  const today = opts.today ?? todayIST();
  const log = opts.log ?? console.log;
  const year = yearOf(today);
  const existing = await db.query<{ n: number }>(`select count(*)::int as n from employees`);
  if (existing[0].n > 0) throw new Error('Database already has employees. Run `npm run db:reset` first if you really want to re-seed.');

  await db.tx(async (q: Queryable) => {
    // locations, departments, leave types
    const locId: Record<string, number> = {};
    for (const l of LOCATIONS) {
      const r = await q.query<{ id: number }>(`insert into locations (code, name, city, state, weekly_off_days) values ($1,$2,$3,$4,$5::smallint[]) returning id`,
        [l.code, l.name, l.city, l.state, `{${l.weekly_off_days.join(',')}}`]);
      locId[l.code] = r[0].id;
    }
    const deptId: Record<string, number> = {};
    for (const d of DEPARTMENTS) deptId[d] = (await q.query<{ id: number }>(`insert into departments (name) values ($1) returning id`, [d]))[0].id;
    const typeId: Record<string, number> = {};
    for (const t of LEAVE_TYPES) {
      typeId[t.code] = (await q.query<{ id: number }>(
        `insert into leave_types (code, name, annual_quota, accrual_method, monthly_rate, carry_forward_max, half_day_allowed, requires_balance,
           counts_calendar_days, eligible_gender, cert_required_after_days, per_event_days, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [t.code, t.name, t.annual_quota, t.accrual_method, t.monthly_rate, t.carry_forward_max, t.half_day_allowed, t.requires_balance,
          t.counts_calendar_days, t.eligible_gender, t.cert_required_after_days, t.per_event_days, t.sort_order]))[0].id;
    }

    // holidays (current and previous year so last-month reports work in January)
    for (const y of [year - 1, year]) {
      for (const h of holidaysFor(y)) {
        for (const code of h.only ? [h.only] : ['PNJ', 'VRN']) {
          await q.query(`insert into holidays (location_id, date, name, type) values ($1,$2,$3,$4) on conflict do nothing`, [locId[code], h.date, h.name, h.type]);
        }
      }
    }

    // employees (managers first so reporting_manager_id resolves)
    const empId: Record<string, string> = {};
    const exitedLwd = addDays(monthStart(year, Number(today.slice(5, 7))), -1); // last day of previous month
    for (const p of PEOPLE) {
      const dob = `${p.dobYear}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
      const r = await q.query<{ id: string }>(
        `insert into employees (email, full_name, mobile, dob, gender, date_of_joining, last_working_day, designation, department_id, location_id,
           reporting_manager_id, salary_grade, is_hr_admin, address_line1, address_line2, city, state, pincode,
           emergency_contact_name, emergency_contact_relation, emergency_contact_phone)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) returning id`,
        [emailFor(p), `${p.first} ${p.last === 'DSouza' ? "D'Souza" : p.last}`, digits(10, String(int(7, 9))), dob, p.gender, p.doj,
          p.lwd ? exitedLwd : null, p.designation, deptId[p.dept], locId[p.loc], p.manager ? empId[p.manager] : null, p.grade, Boolean(p.hr),
          `H.No. ${int(1, 400)}, ${p.loc === 'PNJ' ? 'Altinho' : 'Cortalim'}`, p.loc === 'PNJ' ? 'Near Mahalaxmi Temple' : 'Verna Industrial Estate road',
          p.loc === 'PNJ' ? 'Panaji' : 'Margao', 'Goa', p.loc === 'PNJ' ? '403001' : '403722',
          `${p.gender === 'Female' ? 'Suresh' : 'Lata'} ${p.last === 'DSouza' ? "D'Souza" : p.last}`, p.gender === 'Female' ? 'Father' : 'Mother', digits(10, '9')]);
      empId[p.key] = r[0].id;
      const pan = `${letters(3)}P${p.last[0].toUpperCase()}${digits(4)}${letters(1)}`;
      await q.query(`insert into employee_statutory (employee_id, pan, aadhaar, uan) values ($1,$2,$3,$4)`,
        [r[0].id, pan, digits(12, String(int(2, 9))), p.uan === false ? null : digits(12, '1009')]);
      const bank = BANKS[int(0, BANKS.length - 1)];
      await q.query(`insert into employee_bank (employee_id, account_number, ifsc, bank_name, account_holder_name) values ($1,$2,$3,$4,$5)`,
        [r[0].id, digits(int(11, 14), String(int(1, 9))), `${bank.ifsc}${digits(6)}`, bank.name, `${p.first} ${p.last === 'DSouza' ? "D'Souza" : p.last}`]);
      // Opening balances: EL carried forward from last year (≤ 30) for people who joined before this year
      for (const t of LEAVE_TYPES) {
        const opening = t.code === 'EL' && yearOf(p.doj) < year ? Math.min(30, int(0, 24) + (int(0, 1) ? 0.25 : 0)) : 0;
        await q.query(`insert into leave_balances (employee_id, leave_type_id, year, opening) values ($1,$2,$3,$4)`, [r[0].id, typeId[t.code], year, opening]);
      }
    }
    log(`✓ ${PEOPLE.length} employees`);

    // calendars for generating realistic data
    const cal: Record<string, LocationCalendar> = {};
    for (const l of LOCATIONS) {
      const hs = await q.query<{ date: string; name: string; type: 'NATIONAL' | 'STATE' | 'OPTIONAL' }>(`select date, name, type from holidays where location_id = $1`, [locId[l.code]]);
      cal[l.code] = { weeklyOffDays: l.weekly_off_days, holidays: hs };
    }
    const nextWorking = (from: ISODate, loc: 'PNJ' | 'VRN', skip = 0) => {
      let d = from; let n = 0;
      for (;;) { if (isWorkingDay(d, cal[loc])) { if (n === skip) return d; n++; } d = addDays(d, 1); }
    };
    const prevWorking = (from: ISODate, loc: 'PNJ' | 'VRN', skip = 0) => {
      let d = from; let n = 0;
      for (;;) { if (isWorkingDay(d, cal[loc])) { if (n === skip) return d; n++; } d = addDays(d, -1); }
    };
    const P = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));

    // ---- leave requests (relative to today; all inside the current year)
    const leaveDays = new Set<string>();
    const addLeave = async (key: string, code: string, from: ISODate, to: ISODate, status: string, opts2: { half?: boolean; reason?: string; comment?: string; lop?: number } = {}) => {
      if (yearOf(from) !== year || yearOf(to) !== year) return;
      const p = P[key];
      const lt = LEAVE_TYPES.find((t) => t.code === code)!;
      const { days, charged } = countLeaveDays({ from, to, halfDay: opts2.half, calendar: cal[p.loc], countsCalendarDays: lt.counts_calendar_days });
      if (days <= 0) return;
      const lop = code === 'LOP' ? days : (opts2.lop ?? 0);
      await q.query(
        `insert into leave_requests (employee_id, leave_type_id, from_date, to_date, is_half_day, days, paid_days, lop_days, reason, status, approver_id, approver_comment, decided_at, applied_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [empId[key], typeId[code], from, to, Boolean(opts2.half), days, days - lop, lop, opts2.reason ?? 'Personal work', status,
          status === 'PENDING' ? null : empId[p.manager!], opts2.comment ?? null,
          status === 'PENDING' ? null : istInstant(addDays(from, -2) < today ? addDays(from, -2) : today, '11:00'),
          istInstant(addDays(from, -3) < today ? addDays(from, -3) : today, '10:00')]);
      if (status === 'APPROVED' && !opts2.half) for (const c of charged) leaveDays.add(`${key}|${c.date}`);
    };
    const lastMonth = addDays(monthStart(year, Number(today.slice(5, 7))), -20);
    await addLeave('anita', 'CL', nextWorking(lastMonth, 'VRN'), nextWorking(lastMonth, 'VRN', 1), 'APPROVED', { reason: 'Sister\'s wedding' });
    await addLeave('ravi', 'EL', prevWorking(addDays(today, -9), 'VRN', 2), prevWorking(addDays(today, -9), 'VRN'), 'APPROVED', { reason: 'Village festival' });
    await addLeave('ravi', 'CL', nextWorking(addDays(today, 6), 'VRN'), nextWorking(addDays(today, 6), 'VRN', 1), 'PENDING', { reason: 'Family function in Ponda' });
    await addLeave('sanjay', 'CL', nextWorking(addDays(today, 7), 'VRN'), nextWorking(addDays(today, 7), 'VRN'), 'PENDING', { reason: 'Bank work' }); // clashes with Ravi
    await addLeave('rhea', 'CL', nextWorking(addDays(today, 10), 'PNJ'), nextWorking(addDays(today, 10), 'PNJ', 1), 'APPROVED', { reason: 'Travel to Pune' });
    await addLeave('aditya', 'CL', prevWorking(addDays(today, -5), 'PNJ'), prevWorking(addDays(today, -5), 'PNJ'), 'REJECTED', { reason: 'Personal', comment: 'Quarter-end client visit; please pick another day.' });
    await addLeave('kavita', 'SL', prevWorking(addDays(today, -12), 'VRN'), prevWorking(addDays(today, -12), 'VRN'), 'APPROVED', { reason: 'Fever' });
    await addLeave('pooja', 'CL', prevWorking(addDays(today, -3), 'VRN'), prevWorking(addDays(today, -3), 'VRN'), 'APPROVED', { half: true, reason: 'Doctor appointment' });
    await addLeave('meera', 'CL', nextWorking(addDays(today, 4), 'VRN'), nextWorking(addDays(today, 4), 'VRN'), 'PENDING', { reason: 'Parent-teacher meeting' });
    await addLeave('siddharth', 'LOP', prevWorking(addDays(today, -15), 'PNJ'), prevWorking(addDays(today, -15), 'PNJ'), 'APPROVED', { reason: 'Personal (no balance)' });
    await addLeave('tanvi', 'EL', nextWorking(addDays(today, 14), 'PNJ'), nextWorking(addDays(today, 14), 'PNJ', 2), 'APPROVED', { reason: 'Family trip' });
    await addLeave('neha', 'SL', prevWorking(addDays(today, -1), 'PNJ'), prevWorking(addDays(today, -1), 'PNJ'), 'PENDING', { reason: 'Migraine' });
    log('✓ leave requests');

    // ---- attendance: from the 1st of last month to yesterday (and some of today)
    const start = monthStart(yearOf(lastMonth), Number(lastMonth.slice(5, 7)));
    const nowIst = new Date();
    let rows = 0;
    const ravisLates = new Set([prevWorking(addDays(today, -1), 'VRN'), prevWorking(addDays(today, -1), 'VRN', 3), prevWorking(addDays(today, -1), 'VRN', 5)]
      .filter((d) => d.slice(0, 7) === today.slice(0, 7)));
    const joelMissed = prevWorking(addDays(today, -2), 'VRN');
    for (const p of PEOPLE) {
      const lwd = p.lwd ? exitedLwd : null;
      for (const d of eachDay(start, addDays(today, -1))) {
        if (d < p.doj || (lwd && d > lwd)) continue;
        if (!isWorkingDay(d, cal[p.loc])) continue;
        if (leaveDays.has(`${p.key}|${d}`)) continue;
        let r = rnd();
        if (p.key === 'ravi') r = ravisLates.has(d) ? 0.80 : 0.10;  // exactly 3 lates this month for the demo
        if (p.key === 'joel' && d === joelMissed) r = 0.955;          // missed check-out → regularisation demo
        if (p.key === 'joel' && d !== joelMissed && r >= 0.95) r = 0.1;
        let inT: string | null; let outH: number | null; let wfh = false;
        if (r < 0.76) { inT = `09:${pad(int(0, 59))}`; outH = 8.5 + rnd(); }
        else if (r < 0.84) { inT = `10:${pad(int(16, 45))}`; outH = 8 + rnd(); }        // Late
        else if (r < 0.88) { inT = `09:${pad(int(15, 45))}`; outH = 4.5 + rnd() * 2; }  // Half day
        else if (r < 0.92) { inT = `09:${pad(int(0, 30))}`; outH = null; wfh = p.loc === 'PNJ'; if (!wfh) outH = 9; }
        else if (r < 0.96) { inT = `09:${pad(int(0, 50))}`; outH = null; }              // missed check-out
        else { inT = null; outH = null; }                                                 // absent
        if (!inT) continue;
        const checkIn = istInstant(d, inT);
        const checkOut = outH ? new Date(checkIn.getTime() + outH * 3_600_000) : null;
        await q.query(`insert into attendance (employee_id, date, check_in, check_out, is_wfh, is_late, source) values ($1,$2,$3,$4,$5,$6,'SEED')`,
          [empId[p.key], d, checkIn, checkOut, wfh, !wfh && inT > '10:15']);
        rows++;
      }
      // Today: about half the active team has checked in already (if it's past 10:00 IST and a working day)
      const nowTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(nowIst);
      if (!lwd && today === todayIST() && nowTime > '10:00' && isWorkingDay(today, cal[p.loc]) && !leaveDays.has(`${p.key}|${today}`)
        && !['priya', 'rohan', 'sneha', 'ravi', 'meera', 'neha', 'vikram'].includes(p.key) && rnd() < 0.7) {
        const inT = `09:${pad(int(0, 40))}`;
        await q.query(`insert into attendance (employee_id, date, check_in, is_wfh, is_late, source) values ($1,$2,$3,false,false,'SEED')`, [empId[p.key], today, istInstant(today, inT)]);
        rows++;
      }
    }
    log(`✓ ${rows} attendance rows`);

    // ---- a pending regularisation for Joel's missed punch
    if (joelMissed < today && joelMissed >= P.joel.doj) {
      await q.query(`insert into regularisation_requests (employee_id, date, requested_in, requested_out, reason, requested_by) values ($1,$2,$3,$4,$5,$1)`,
        [empId.joel, joelMissed, istInstant(joelMissed, '09:05'), istInstant(joelMissed, '18:10'), 'Forgot to check out; was fixing the boiler till 6 pm.']);
    }

    // ---- policy text for explain_policy
    for (const d of POLICY_DOCS) await q.query(`insert into policy_documents (slug, title, body) values ($1,$2,$3)`, [d.slug, d.title, d.body]);
    log('✓ holidays, balances, regularisation, policy text');
  });

  const logins = PEOPLE.map((p) => ({
    role: p.hr ? 'HR Admin' : PEOPLE.some((x) => x.manager === p.key) ? 'Manager' : p.lwd ? 'Employee (exited)' : 'Employee',
    name: `${p.first} ${p.last}`, email: emailFor(p), location: p.loc,
  }));
  return { logins };
}
