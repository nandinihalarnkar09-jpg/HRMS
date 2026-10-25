import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayIST, istTimeOf, istDateOf, istInstant, addDays, weekdayOf, eachDay, monthEnd,
  daysInclusive, isValidISODate, formatTimeIST,
} from '../../lib/core/dates';
import { isLateCheckIn } from '../../lib/core/day-status';

// These tests are run under TZ=America/Los_Angeles and TZ=Pacific/Kiritimati by `npm test`
// ("change your laptop's time zone" from the brief). Results must not change.

test(`IST "today" does not follow the host time zone (TZ=${process.env.TZ ?? 'unset'}) — R-ATT-01`, () => {
  // 2026-10-25 19:00 UTC = 2026-10-26 00:30 IST → already the 26th in India
  assert.equal(todayIST(new Date('2026-10-25T19:00:00Z')), '2026-10-26');
  // 2026-10-25 18:29 UTC = 23:59 IST → still the 25th
  assert.equal(todayIST(new Date('2026-10-25T18:29:00Z')), '2026-10-25');
});

test('IST wall clock for a stored instant', () => {
  assert.equal(istTimeOf('2026-10-26T04:50:00Z'), '10:20:00');
  assert.equal(formatTimeIST('2026-10-26T04:50:00Z'), '10:20');
  assert.equal(istDateOf(istInstant('2026-10-26', '00:30')), '2026-10-26');
});

test('Checklist: check-in at 10:20 AM IST is Late; 10:15:00 is not — R-ATT-04', () => {
  assert.equal(isLateCheckIn(istInstant('2026-10-26', '10:20')), true);
  assert.equal(isLateCheckIn(istInstant('2026-10-26', '10:15:00')), false);
  assert.equal(isLateCheckIn(istInstant('2026-10-26', '10:15:01')), true);
  assert.equal(isLateCheckIn(istInstant('2026-10-26', '10:20'), true), false, 'WFH is never late');
});

test('date arithmetic is time-zone proof', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(weekdayOf('2026-10-25'), 0, '25 Oct 2026 is a Sunday');
  assert.equal(weekdayOf('2026-10-30'), 5, 'Friday');
  assert.equal(eachDay('2026-10-30', '2026-11-02').length, 4);
  assert.equal(monthEnd(2026, 2), '2026-02-28');
  assert.equal(monthEnd(2028, 2), '2028-02-29');
  assert.equal(daysInclusive('2026-01-01', '2026-12-31'), 365);
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('2026-02-28'), true);
});
