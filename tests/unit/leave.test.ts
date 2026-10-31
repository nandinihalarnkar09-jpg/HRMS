import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLeaveDays } from '../../lib/core/calendar';
import { computeBalance, proratedYearStartCredit, monthlyAccrual, completedCalendarMonths, carryForward, type Balance } from '../../lib/core/leave-balance';
import { evaluateLeaveRequest, canCancel, halfDayLabel, slotMentioned } from '../../lib/core/leave-rules';
import { splitPaidLop, allocateDays } from '../../lib/core/leave-split';
import { PANAJI, VERNA, CL, SL, EL, ML, PL, LOP } from './fixtures';

const TODAY = '2026-10-25';

// ---------- working days (R-LV-04)
test('Checklist: leave Friday to Monday at head office counts 2 days, not 4 — R-LV-04', () => {
  const r = countLeaveDays({ from: '2026-10-30', to: '2026-11-02', calendar: PANAJI });
  assert.equal(r.days, 2);
  assert.deepEqual(r.excluded.map((e) => e.reason), ['WEEKLY_OFF', 'WEEKLY_OFF']);
});

test('Same Friday to Monday at the Verna plant counts 3 (Saturday is a working day) — R-ATT-02', () => {
  assert.equal(countLeaveDays({ from: '2026-10-30', to: '2026-11-02', calendar: VERNA }).days, 3);
});

test('Holidays inside the range are never counted; optional holidays are', () => {
  // Thu 1 Oct – Mon 5 Oct at Panaji: Fri 2 Oct holiday, Sat/Sun off → Thu + Mon = 2
  const r = countLeaveDays({ from: '2026-10-01', to: '2026-10-05', calendar: PANAJI });
  assert.equal(r.days, 2);
  assert.ok(r.excluded.some((e) => e.reason === 'HOLIDAY' && e.name === 'Gandhi Jayanti'));
  // 1 Jan (OPTIONAL) is a working day (D-7)
  assert.equal(countLeaveDays({ from: '2026-01-01', to: '2026-01-01', calendar: PANAJI }).days, 1);
});

test('Checklist: a state holiday added for Verna does not affect Panaji — R-ATT-09', () => {
  assert.equal(countLeaveDays({ from: '2026-09-15', to: '2026-09-15', calendar: VERNA }).days, 0);
  assert.equal(countLeaveDays({ from: '2026-09-15', to: '2026-09-15', calendar: PANAJI }).days, 1);
});

test('Half day counts 0.5; maternity counts calendar days (D-5)', () => {
  assert.equal(countLeaveDays({ from: '2026-10-27', to: '2026-10-27', halfDay: true, calendar: PANAJI }).days, 0.5);
  assert.equal(countLeaveDays({ from: '2026-10-30', to: '2026-11-02', calendar: PANAJI, countsCalendarDays: true }).days, 4);
});

// ---------- accrual (R-LV-02, R-LV-03)
test('Checklist: employee who joined on 1 July sees pro-rated CL and SL — R-LV-02', () => {
  assert.equal(proratedYearStartCredit(8, '2026-07-01', 2026), 4);
  assert.equal(proratedYearStartCredit(7, '2026-07-01', 2026), 3.5);
  assert.equal(proratedYearStartCredit(8, '2026-07-16', 2026), 3, '16 July: 5 months → 3.33 → 3');
  assert.equal(proratedYearStartCredit(8, '2025-03-10', 2026), 8, 'joined last year: full credit');
  assert.equal(proratedYearStartCredit(8, '2027-01-05', 2026), 0);
  assert.equal(proratedYearStartCredit(8, '2026-01-01', 2026), 8);
  assert.equal(proratedYearStartCredit(8, '2026-06-15', 2026), 4.5, 'L4 example: 15 June → 4.67 → 4.5 CL');
  assert.equal(proratedYearStartCredit(7, '2026-06-15', 2026), 4, 'L4 example: 4.08 → 4 SL');
});

test('EL accrues 1.25 per completed calendar month (rule L5)', () => {
  assert.equal(completedCalendarMonths('2020-04-01', null, 2026, '2026-10-25'), 9, 'Jan–Sep');
  assert.equal(completedCalendarMonths('2020-04-01', null, 2026, '2026-10-31'), 10, 'October done on its last day');
  assert.equal(completedCalendarMonths('2026-07-01', null, 2026, '2026-12-31'), 6, 'joined on the 1st: July counts');
  assert.equal(completedCalendarMonths('2026-06-15', null, 2026, '2026-12-31'), 6, 'joined 15 June: June does not count');
  assert.equal(monthlyAccrual(1.25, 15, '2020-04-01', null, 2026, TODAY), 11.25);
  assert.equal(monthlyAccrual(1.25, 15, '2026-07-01', null, 2026, TODAY), 3.75);
  assert.equal(monthlyAccrual(1.25, 15, '2026-06-15', null, 2026, '2026-12-31'), 7.5, 'L5 example');
  assert.equal(monthlyAccrual(1.25, 15, '2020-04-01', null, 2026, '2026-12-31'), 15);
  assert.equal(monthlyAccrual(1.25, 15, '2020-04-01', '2026-03-31', 2026, TODAY), 3.75, 'stops at last working day');
  assert.equal(monthlyAccrual(1.25, 15, '2020-04-01', '2026-03-30', 2026, TODAY), 2.5, 'March not completed');
});

test('EL carries forward up to 30; CL/SL lapse — R-LV-03', () => {
  assert.equal(carryForward(42.5, 30), 30);
  assert.equal(carryForward(12.25, 30), 12.25);
  assert.equal(carryForward(5, 0), 0);
});

test('Checklist: balance does not change while pending — R-LV-06', () => {
  const b = computeBalance({ type: CL, year: 2026, today: TODAY, doj: '2020-01-01', lwd: null, opening: 0, adjustment: 0, used: 2, pending: 3 });
  assert.equal(b.accrued, 8);
  assert.equal(b.available, 6, 'pending does not reduce available');
  assert.equal(b.canApply, 3, 'but it does reduce what can still be applied for');
  const approved = computeBalance({ type: CL, year: 2026, today: TODAY, doj: '2020-01-01', lwd: null, opening: 0, adjustment: 0, used: 5, pending: 0 });
  assert.equal(approved.available, 3, 'balance drops only once approved (used)');
});

// ---------- evaluating a request
const emp = { doj: '2020-04-01', lwd: null, gender: 'Male' };
const bal = (type = CL, used = 0, pending = 0, opening = 0): Balance =>
  computeBalance({ type, year: 2026, today: TODAY, doj: emp.doj, lwd: null, opening, adjustment: 0, used, pending });
const ev = (over: Partial<Parameters<typeof evaluateLeaveRequest>[0]>) => evaluateLeaveRequest({
  type: CL, from: '2026-10-30', to: '2026-11-02', halfDay: false, reason: 'Family function', today: TODAY,
  employee: emp, calendar: PANAJI, balance: bal(), hasCertificate: false, acceptLop: false, ...over,
});

test('Checklist: applying for more CL than available offers conversion to LOP — R-LV-07', () => {
  const r = ev({ balance: bal(CL, 7) }); // 1 CL left, 2 working days requested
  assert.equal(r.ok, false);
  assert.deepEqual(r.lopOffer, { paidDays: 1, lopDays: 1 });
  assert.match(r.errors.join(' '), /Loss of Pay/);
  const accepted = ev({ balance: bal(CL, 7), acceptLop: true });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.paidDays, 1);
  assert.equal(accepted.lopDays, 1);
});

test('Pending requests count against what can be applied (no double booking)', () => {
  const r = ev({ balance: bal(CL, 0, 7) }); // 8 available, 7 pending → 1 can apply
  assert.deepEqual(r.lopOffer, { paidDays: 1, lopDays: 1 });
});

test('EL (no half days) floors the paid part to whole days', () => {
  assert.deepEqual(splitPaidLop(3, 2.75, false), { paidDays: 2, lopDays: 1 });
  assert.deepEqual(splitPaidLop(3, 2.75, true), { paidDays: 2.5, lopDays: 0.5 });
  const alloc = allocateDays([{ date: '2026-11-03', portion: 1 }, { date: '2026-11-02', portion: 1 }], 1);
  assert.deepEqual(alloc.map((a) => [a.date, a.paid, a.lop]), [['2026-11-02', 1, 0], ['2026-11-03', 0, 1]], 'earliest days are paid');
});

test('Checklist: SL of 3 days cannot be submitted without a certificate — R-LV-08', () => {
  const noCert = ev({ type: SL, balance: bal(SL), from: '2026-10-27', to: '2026-10-29' });
  assert.equal(noCert.days, 3);
  assert.equal(noCert.needsCertificate, true);
  assert.equal(noCert.ok, false);
  assert.match(noCert.errors.join(' '), /medical certificate/);
  assert.equal(ev({ type: SL, balance: bal(SL), from: '2026-10-27', to: '2026-10-29', hasCertificate: true }).ok, true);
  assert.equal(ev({ type: SL, balance: bal(SL), from: '2026-10-27', to: '2026-10-28' }).ok, true, '2 days needs none');
});

test('Leave more than 30 days in the past is refused — R-LV-09', () => {
  assert.equal(ev({ from: '2026-09-24', to: '2026-09-24' }).ok, false);
  assert.equal(ev({ from: '2026-09-25', to: '2026-09-25' }).ok, true);
});

test('Half day only for CL/SL/LOP and a single date — R-LV-05', () => {
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-27', halfDay: true, halfDaySession: 'FIRST' }).days, 0.5);
  assert.equal(ev({ type: EL, balance: bal(EL), from: '2026-10-27', to: '2026-10-27', halfDay: true, halfDaySession: 'FIRST' }).ok, false);
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-28', halfDay: true, halfDaySession: 'FIRST' }).ok, false);
});

test('Half-day leave needs a time slot: first half or second half — R-LV-19', () => {
  const none = ev({ from: '2026-10-27', to: '2026-10-27', halfDay: true });
  assert.equal(none.ok, false);
  assert.match(none.errors.join(' '), /which half/);
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-27', halfDay: true, halfDaySession: 'NOON' }).ok, false);
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-27', halfDay: true, halfDaySession: 'FIRST' }).ok, true);
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-27', halfDay: true, halfDaySession: 'SECOND' }).ok, true);
  assert.equal(ev({ from: '2026-10-27', to: '2026-10-27', halfDay: false }).ok, true, 'full day needs no slot');
  assert.equal(halfDayLabel('FIRST'), 'Half day · first half (morning)');
  assert.equal(halfDayLabel(null), 'Half day', 'older requests without a slot');
});

test('A range with only weekly offs needs no leave', () => {
  const r = ev({ from: '2026-10-31', to: '2026-11-01' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no working days/);
});

test('Maternity: female only, calendar days, 182 per event; Paternity 5 days male only — R-LV-14/15', () => {
  const female = { ...emp, gender: 'Female' };
  const m = ev({ type: ML, balance: bal(ML), employee: female, from: '2026-11-02', to: '2027-05-02' });
  assert.equal(m.ok, false, 'crosses the leave year');
  const ok = ev({ type: ML, balance: bal(ML), employee: female, from: '2026-11-02', to: '2026-12-31' });
  assert.equal(ok.ok, true);
  assert.equal(ok.days, 60);
  assert.equal(ev({ type: ML, balance: bal(ML), employee: emp, from: '2026-11-02', to: '2026-11-03' }).ok, false, 'male cannot take ML');
  assert.equal(ev({ type: PL, balance: bal(PL), from: '2026-11-02', to: '2026-11-06' }).ok, true);
  assert.equal(ev({ type: PL, balance: bal(PL), from: '2026-11-02', to: '2026-11-09' }).ok, false, '6 days > 5');
});

test('LOP request: unlimited, all days are LOP — R-LV-16', () => {
  const r = ev({ type: LOP, balance: bal(LOP), from: '2026-11-02', to: '2026-11-13' });
  assert.equal(r.ok, true);
  assert.equal(r.paidDays, 0);
  assert.equal(r.lopDays, 10);
});

test('Checklist: cancelling — pending any time; approved only before it starts — R-LV-13', () => {
  assert.equal(canCancel('PENDING', '2026-10-20', TODAY), true);
  assert.equal(canCancel('APPROVED', '2026-10-26', TODAY), true);
  assert.equal(canCancel('APPROVED', '2026-10-25', TODAY), false, 'already started today');
  assert.equal(canCancel('REJECTED', '2026-11-01', TODAY), false);
});

test('Agent may only use a half the user named (English / Hinglish) — R-LV-19', () => {
  assert.equal(slotMentioned('Next Wednesday half day CL chahiye, doctor appointment'), null, 'not said → must ask');
  assert.equal(slotMentioned('first half please'), 'FIRST');
  assert.equal(slotMentioned('kal subah ki half day'), 'FIRST');
  assert.equal(slotMentioned('second half, after lunch'), 'SECOND');
  assert.equal(slotMentioned('dopahar ke baad chutti'), 'SECOND');
  assert.equal(slotMentioned('morning or afternoon?'), null, 'both named → ambiguous');
});
