import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDayStatus, latePenaltyDays, type AttendanceFact } from '../../lib/core/day-status';
import { summariseMonth, toCsv } from '../../lib/core/summary';
import { istInstant, eachDay } from '../../lib/core/dates';
import { PANAJI, VERNA } from './fixtures';

const TODAY = '2026-10-25';
const punch = (date: string, inT: string, outT: string | null, extra: Partial<AttendanceFact> = {}): AttendanceFact => ({
  checkIn: istInstant(date, inT), checkOut: outT ? istInstant(date, outT) : null, isWfh: false, isLate: inT > '10:15', ...extra,
});
const day = (date: string, attendance: AttendanceFact | null, over: Partial<Parameters<typeof computeDayStatus>[0]> = {}) =>
  computeDayStatus({ date, today: TODAY, doj: '2020-01-01', lwd: null, calendar: PANAJI, attendance, leave: null, ...over });

test('Checklist: 5 hours worked shows Half Day; 8 hours shows Present — R-ATT-05', () => {
  assert.equal(day('2026-10-20', punch('2026-10-20', '09:00', '14:00')).status, 'HALF_DAY');
  assert.equal(day('2026-10-20', punch('2026-10-20', '09:00', '17:00')).status, 'PRESENT');
  assert.equal(day('2026-10-20', punch('2026-10-20', '09:00', '12:59')).status, 'ABSENT', 'under 4 hours');
  assert.equal(day('2026-10-20', punch('2026-10-20', '09:00', '13:00')).status, 'HALF_DAY', 'exactly 4 hours');
});

test('No punch on a past working day = Absent; missed check-out = Absent (missed punch)', () => {
  assert.equal(day('2026-10-20', null).status, 'ABSENT');
  const r = day('2026-10-20', punch('2026-10-20', '09:00', null));
  assert.equal(r.status, 'ABSENT');
  assert.equal(r.missedPunch, true);
});

test('Today with only a check-in is In progress; future is Upcoming', () => {
  const today = '2026-10-23'; // a Friday
  assert.equal(day(today, punch(today, '09:00', null), { today }).status, 'IN_PROGRESS');
  assert.equal(day('2026-10-27', null).status, 'UPCOMING');
});

test('Checklist: plant employee Saturday is a working day; head office Saturday is a weekly off — R-ATT-02', () => {
  assert.equal(day('2026-10-24', null).status, 'WEEKLY_OFF');
  assert.equal(day('2026-10-24', null, { calendar: VERNA }).status, 'ABSENT');
  assert.equal(day('2026-10-24', punch('2026-10-24', '09:00', '17:30'), { calendar: VERNA }).status, 'PRESENT');
});

test('Holiday is per location — R-ATT-09', () => {
  assert.equal(day('2026-09-15', null, { calendar: VERNA }).status, 'HOLIDAY');
  assert.equal(day('2026-09-15', null, { calendar: PANAJI }).status, 'ABSENT');
});

test('Approved leave wins even if the employee punched in — brief', () => {
  const r = day('2026-10-20', punch('2026-10-20', '09:00', '17:00'), { leave: { typeCode: 'CL', portion: 1, paid: 1, lop: 0 } });
  assert.equal(r.status, 'ON_LEAVE');
  assert.deepEqual(r.units.leave, { CL: 1 });
  assert.equal(r.units.present, 0);
});

test('WFH counts as Present and is never Late — A3', () => {
  const r = day('2026-10-20', punch('2026-10-20', '11:00', null, { isWfh: true, isLate: false }));
  assert.equal(r.status, 'WFH');
  assert.equal(r.units.present, 1);
  assert.equal(r.units.wfh, 1);
});

test('Half-day leave + 4h worked = 0.5 leave + 0.5 present; without work = 0.5 LOP', () => {
  const leave = { typeCode: 'CL', portion: 0.5, paid: 0.5, lop: 0 };
  const worked = day('2026-10-20', punch('2026-10-20', '13:30', '18:00'), { leave });
  assert.deepEqual([worked.units.leave.CL, worked.units.present, worked.units.lop], [0.5, 0.5, 0]);
  const notWorked = day('2026-10-20', null, { leave });
  assert.deepEqual([notWorked.units.leave.CL, notWorked.units.present, notWorked.units.lop], [0.5, 0, 0.5]);
});

test('Checklist: the third Late in a month creates a half-day LOP — R-ATT-06', () => {
  assert.equal(latePenaltyDays(2), 0);
  assert.equal(latePenaltyDays(3), 0.5);
  assert.equal(latePenaltyDays(5), 0.5);
  assert.equal(latePenaltyDays(6), 1);
  const days = ['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => day(d, punch(d, '10:20', '18:30')));
  const s = summariseMonth(days);
  assert.equal(s.lateCount, 3);
  assert.equal(s.daysPresent, 3);
  assert.equal(s.lopDays, 0.5);
});

test('Month summary totals match the day statuses (L8)', () => {
  // Panaji, October 2026, joined mid-month on the 19th
  const results = eachDay('2026-10-01', '2026-10-31').map((d) => {
    const att = d === '2026-10-19' ? punch(d, '09:00', '17:00')
      : d === '2026-10-20' ? punch(d, '09:00', '14:00')
      : d === '2026-10-21' ? punch(d, '09:30', null, { isWfh: true })
      : null;
    const leave = d === '2026-10-22' ? { typeCode: 'CL', portion: 1, paid: 1, lop: 0 }
      : d === '2026-10-23' ? { typeCode: 'CL', portion: 1, paid: 0, lop: 1 } : null;
    return computeDayStatus({ date: d, today: TODAY, doj: '2026-10-19', lwd: null, calendar: PANAJI, attendance: att, leave });
  });
  const s = summariseMonth(results);
  assert.equal(s.calendarDays, 13);          // 19..31
  assert.equal(s.daysPresent, 2.5);          // 19 P, 20 HD, 21 WFH
  assert.equal(s.wfhDays, 1);
  assert.deepEqual(s.leaveByType, { CL: 1 });
  assert.equal(s.lopDays, 1.5);              // 0.5 (half day) + 1 (CL converted to LOP); 24/25 off; 26.. upcoming
  assert.equal(s.weeklyOffs, 3);             // 24, 25, 31 (future weekly offs still show as WO)
});

test('CSV escapes commas/quotes and blocks formula injection', () => {
  const csv = toCsv(['a', 'b'], [['x,y', '=HYPERLINK("evil")'], [-1.5, 'ok']]);
  assert.equal(csv, 'a,b\r\n"x,y","\'=HYPERLINK(""evil"")"\r\n-1.5,ok\r\n');
});
