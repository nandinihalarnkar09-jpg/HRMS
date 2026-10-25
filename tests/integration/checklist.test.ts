/**
 * The "Definition of done" checklist from the brief, run against real Postgres through the
 * same service functions the screens and the agent use.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './helpers';
import type { Actor } from '../../lib/core/authz';
import { addDays, istInstant, monthOf, todayIST, weekdayOf, yearOf, eachDay, monthStart, monthEnd } from '../../lib/core/dates';
import * as employees from '../../lib/services/employees';
import * as attendance from '../../lib/services/attendance';
import * as leave from '../../lib/services/leave';
import * as reports from '../../lib/services/reports';
import * as settings from '../../lib/services/settings';
import { resolveActor } from '../../lib/services/identity';
import { getMonthForEmployee } from '../../lib/services/attendance';

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let hr: Actor, rohan: Actor, ravi: Actor, sneha: Actor, aditya: Actor, meera: Actor, anita: Actor, vikram: Actor;
const today = todayIST();
/** next date (after today) with this weekday, staying inside the current year when possible */
const next = (weekday: number, after = today) => { let d = addDays(after, 1); while (weekdayOf(d) !== weekday) d = addDays(d, 1); return d; };

const validEmployee = (over: Record<string, unknown> = {}) => ({
  full_name: 'Test Person', email: `test.${Math.random().toString(36).slice(2, 8)}@example.com`, mobile: '9822012345',
  dob: '1995-05-05', gender: 'Female', address_line1: 'Plot 12, Porvorim', address_line2: '', city: 'Porvorim', state: 'Goa', pincode: '403521',
  date_of_joining: today, designation: 'Trainee', department_id: 1, location_id: 1, reporting_manager_id: null, salary_grade: 'G1',
  pan: `ABCPT${String(Math.floor(Math.random() * 9000) + 1000)}K`, aadhaar: '234567890123', uan: '', account_number: '123456789012', ifsc: 'SBIN0001234',
  bank_name: 'State Bank of India', account_holder_name: 'Test Person',
  emergency_contact_name: 'Asha Person', emergency_contact_relation: 'Mother', emergency_contact_phone: '9822098765', ...over,
});

before(async () => {
  ctx = await setupTestDb('checklist');
  [hr, rohan, ravi, sneha, aditya, meera, anita, vikram] = await Promise.all(
    ['priya', 'rohan', 'ravi', 'sneha', 'aditya', 'meera', 'anita', 'vikram'].map((n) => ctx.actorFor(n)));
});
after(async () => { await ctx.cleanup(); });

// ================================================================ Employee Master
test('Roles: 1 HR Admin and exactly 3 managers are derived from data', async () => {
  const all = await ctx.db.query<{ email: string }>(`select email from employees where last_working_day is null`);
  const actors = await Promise.all(all.map((e) => resolveActor({ email: e.email }, { q: ctx.db })));
  const ok = actors.filter((a) => a.status === 'ok').map((a) => (a as { actor: Actor }).actor);
  assert.equal(ok.filter((a) => a.isHrAdmin).length, 1);
  assert.equal(ok.filter((a) => a.isManager).length, 3);
});

test('HR adds an employee; code is generated and unique (E1)', async () => {
  const a = await employees.createEmployee(hr, validEmployee() as never);
  const b = await employees.createEmployee(hr, validEmployee() as never);
  assert.match(a.employee_code, /^KCF\d{4}$/);
  assert.notEqual(a.employee_code, b.employee_code);
  await assert.rejects(ctx.db.query(`update employees set employee_code = 'KCF9999' where id = $1`, [a.id]), /cannot be changed/);
  await assert.rejects(ctx.db.query(`delete from employees where id = $1`, [a.id]), /never deleted/);
});

test('Invalid PAN (ABC123), IFSC and 9-digit mobile are rejected with clear messages', async () => {
  await assert.rejects(employees.createEmployee(hr, validEmployee({ pan: 'ABC123', ifsc: 'SBIN1234567', mobile: '982201234' }) as never), (e: { fieldErrors: Record<string, string> }) => {
    assert.match(e.fieldErrors.pan, /5 letters, 4 digits, 1 letter/);
    assert.match(e.fieldErrors.ifsc, /then 0/);
    assert.match(e.fieldErrors.mobile, /10 digits/);
    return true;
  });
  // And the database refuses it even if the app check were skipped
  await assert.rejects(ctx.db.query(`update employee_statutory set pan = 'ABC123' where employee_id = $1`, [ravi.id]), /check/);
});

test('An employee aged 17 on the joining date is rejected', async () => {
  const dob = addDays(today, -(17 * 365 + 10));
  await assert.rejects(employees.createEmployee(hr, validEmployee({ dob }) as never), (e: { fieldErrors: Record<string, string> }) => /at least 18/.test(e.fieldErrors.dob));
});

test("Setting A's manager to B, then B's manager to A, is blocked (E4)", async () => {
  const a = await employees.createEmployee(hr, validEmployee() as never);
  const b = await employees.createEmployee(hr, validEmployee({ reporting_manager_id: a.id }) as never);
  await assert.rejects(employees.updateEmployee(hr, a.id, { reporting_manager_id: b.id }), (e: { fieldErrors: Record<string, string> }) => /reporting loop/.test(e.fieldErrors.reporting_manager_id));
  await assert.rejects(employees.updateEmployee(hr, a.id, { reporting_manager_id: a.id }), (e: { fieldErrors: Record<string, string> }) => /themselves/.test(e.fieldErrors.reporting_manager_id));
  await assert.rejects(ctx.db.query(`update employees set reporting_manager_id = $1 where id = $2`, [b.id, a.id]), /R-EMP-09/, 'DB trigger also blocks it');
});

test('Employee cannot open another employee profile by changing the URL', async () => {
  await assert.rejects(employees.getEmployeeProfile(ravi, anita.id), { name: 'NotFoundError' });
  await assert.rejects(employees.getStatutoryMasked(ravi, anita.id), { name: 'NotFoundError' });
  await assert.rejects(employees.getEmployeeProfile(rohan, ravi.id), { name: 'NotFoundError' }, 'managers use team views');
  assert.equal((await employees.getEmployeeProfile(ravi, ravi.id)).id, ravi.id);
  assert.equal((await employees.getEmployeeProfile(hr, ravi.id)).id, ravi.id);
});

test('Aadhaar is never shown in full, including in the CSV (E7)', async () => {
  const full = (await ctx.db.query<{ aadhaar: string; pan: string }>(`select aadhaar, pan from employee_statutory where employee_id = $1`, [ravi.id]))[0];
  const own = await employees.getStatutoryMasked(ravi, ravi.id);
  assert.equal(own.aadhaar, `XXXX XXXX ${full.aadhaar.slice(-4)}`);
  assert.equal(own.pan, `${full.pan.slice(0, 5)}****${full.pan.slice(9)}`);
  assert.match(own.account, /^XXXXXX\d{4}$/);
  const csv = await employees.directoryCsv(hr);
  const allAadhaar = await ctx.db.query<{ aadhaar: string; pan: string }>(`select aadhaar, pan from employee_statutory`);
  for (const r of allAadhaar) {
    assert.ok(!csv.includes(r.aadhaar), 'full Aadhaar leaked into CSV');
    assert.ok(!csv.includes(r.pan), 'full PAN leaked into CSV');
  }
  const month = await reports.monthEndCsv(hr, yearOf(today), monthOf(today));
  for (const r of allAadhaar) assert.ok(!month.csv.includes(r.aadhaar));
});

test('HR Reveal shows PAN and is logged; Aadhaar can never be revealed', async () => {
  const pan = await employees.revealSensitive(hr, ravi.id, 'pan');
  assert.match(pan, /^[A-Z]{5}\d{4}[A-Z]$/);
  const log = await ctx.db.query(`select * from audit_log where action = 'REVEAL' and subject_employee_id = $1 and changed_by = $2`, [ravi.id, hr.id]);
  assert.equal(log.length, 1);
  await assert.rejects(employees.revealSensitive(hr, ravi.id, 'aadhaar' as never), { name: 'ForbiddenError' });
  await assert.rejects(employees.revealSensitive(rohan, ravi.id, 'pan'), { name: 'ForbiddenError' });
});

test('RLS: even a raw query as the employee cannot read another person\'s PAN', async () => {
  const mine = await employees.withRls(ravi, (q) => q.query(`select pan from employee_statutory`));
  assert.equal(mine.length, 1, 'only own row visible');
  const asHr = await employees.withRls(hr, (q) => q.query(`select pan from employee_statutory`));
  assert.ok(asHr.length >= 20);
  await assert.rejects(employees.withRls(hr, (q) => q.query(`select aadhaar from employee_statutory`)), /permission denied/, 'full Aadhaar column not granted');
});

test('Changing a designation creates an audit log entry (E8)', async () => {
  await employees.updateEmployee(hr, anita.id, { designation: 'Senior QA Analyst', pan: 'ZZZPF1234Q' });
  const rows = await ctx.db.query<{ field: string; old_value: string; new_value: string; changed_by: string }>(
    `select field, old_value, new_value, changed_by from audit_log where subject_employee_id = $1 and action = 'UPDATE' order by id`, [anita.id]);
  const d = rows.find((r) => r.field === 'designation')!;
  assert.deepEqual([d.old_value, d.new_value, d.changed_by], ['QA Analyst', 'Senior QA Analyst', hr.id]);
  const p = rows.find((r) => r.field === 'pan')!;
  assert.equal(p.new_value, 'ZZZPF****Q', 'statutory change stored masked');
  await assert.rejects(employees.updateEmployee(ravi, ravi.id, { designation: 'CEO' }), { name: 'ForbiddenError' });
});

test('Self-service edit changes contact fields only (E5)', async () => {
  await employees.updateContact(ravi, ravi.id, { mobile: '9123456780', designation: 'CEO' } as never);
  const p = await employees.getEmployeeProfile(ravi, ravi.id);
  assert.equal(p.mobile, '9123456780');
  assert.equal(p.designation, 'Machine Operator');
  await assert.rejects(employees.updateContact(ravi, anita.id, { mobile: '9123456781' }), { name: 'NotFoundError' });
});

test('A deactivated employee cannot log in after the last working day (E6)', async () => {
  const exited = await ctx.db.query<{ email: string }>(`select email from employees where email like 'nikhil.%'`);
  const r = await resolveActor({ email: exited[0].email }, { q: ctx.db });
  assert.equal(r.status, 'exited');
  const e = await employees.createEmployee(hr, validEmployee({ date_of_joining: addDays(today, -100) }) as never);
  await employees.deactivateEmployee(hr, e.id, today, 'Resigned');
  const email = (await ctx.db.query<{ email: string }>(`select email from employees where id = $1`, [e.id]))[0].email;
  assert.equal((await resolveActor({ email }, { q: ctx.db, today })).status, 'ok', 'can still log in ON the last day');
  assert.equal((await resolveActor({ email }, { q: ctx.db, today: addDays(today, 1) })).status, 'exited', 'blocked the next day');
  assert.equal((await ctx.db.query(`select 1 from employees where id = $1`, [e.id])).length, 1, 'record kept');
});

// ================================================================ Attendance
test('Checking in twice on the same day does not create a second record (A1)', async () => {
  const now = new Date();
  const a = await attendance.checkIn(meera, now);
  const b = await attendance.checkIn(meera, new Date(now.getTime() + 60_000));
  assert.equal(b.created, false);
  assert.equal(String(b.record.check_in), String(a.record.check_in));
  const rows = await ctx.db.query(`select 1 from attendance where employee_id = $1 and date = $2`, [meera.id, todayIST(now)]);
  assert.equal(rows.length, 1);
});

test('Check-in at 10:20 AM is Late; the third Late in a month creates a half-day LOP', async () => {
  // use a fresh employee and the first 3 working days of a past month so the seed doesn't interfere
  const e = await employees.createEmployee(hr, validEmployee({ date_of_joining: addDays(today, -60), location_id: 2 }) as never);
  const actor = (await resolveActor({ email: (await ctx.db.query<{ email: string }>(`select email from employees where id=$1`, [e.id]))[0].email }, { q: ctx.db })) as { actor: Actor };
  const y = yearOf(addDays(today, -30)); const m = monthOf(addDays(today, -30));
  const days = eachDay(monthStart(y, m), monthEnd(y, m)).filter((d) => weekdayOf(d) >= 1 && weekdayOf(d) <= 5 && d >= addDays(today, -60)).slice(0, 3);
  for (const d of days) {
    const r = await attendance.checkIn(actor.actor, istInstant(d, '10:20'));
    assert.equal(r.record.is_late, true);
    await attendance.checkOut(actor.actor, istInstant(d, '18:45'));
  }
  const rep = await reports.monthEndSummary(hr, y, m);
  const row = rep.rows.find((r) => r.employee.id === e.id)!;
  assert.equal(row.summary.lateCount, 3);
  assert.equal(row.summary.latePenalty, 0.5);
});

test('5 hours worked shows Half Day; 8 hours shows Present', async () => {
  const e = await employees.createEmployee(hr, validEmployee({ date_of_joining: addDays(today, -40), location_id: 2 }) as never);
  const a = ((await resolveActor({ email: (await ctx.db.query<{ email: string }>(`select email from employees where id=$1`, [e.id]))[0].email }, { q: ctx.db })) as { actor: Actor }).actor;
  const d1 = addDays(today, -8); const d2 = addDays(today, -9);
  await attendance.checkIn(a, istInstant(d1, '09:00')); await attendance.checkOut(a, istInstant(d1, '14:00'));
  await attendance.checkIn(a, istInstant(d2, '09:00')); await attendance.checkOut(a, istInstant(d2, '17:00'));
  for (const [d, expected] of [[d1, 'HALF_DAY'], [d2, 'PRESENT']] as const) {
    const month = await getMonthForEmployee(a, a.id, yearOf(d), monthOf(d));
    const day = month.days.find((x) => x.date === d)!;
    assert.equal(day.status, weekdayOf(d) === 0 ? 'WEEKLY_OFF' : expected, d);
  }
});

test("A plant employee's Saturday is a working day; a head office employee's is a weekly off", async () => {
  const sat = (() => { let d = addDays(today, -7); while (weekdayOf(d) !== 6) d = addDays(d, -1); return d; })();
  const plant = await getMonthForEmployee(ravi, ravi.id, yearOf(sat), monthOf(sat));
  const office = await getMonthForEmployee(aditya, aditya.id, yearOf(sat), monthOf(sat));
  assert.notEqual(plant.days.find((d) => d.date === sat)!.status, 'WEEKLY_OFF');
  assert.equal(office.days.find((d) => d.date === sat)!.status, 'WEEKLY_OFF');
});

test('A state holiday added for Verna does not appear for Panaji (A7)', async () => {
  const d = next(3, addDays(today, 20)); // a Wednesday
  await settings.addHoliday(hr, { date: d, name: 'Verna Plant Foundation Day', type: 'STATE', locationIds: [2] });
  const verna = await settings.listHolidays(ravi, { year: yearOf(d), month: monthOf(d) });
  const panaji = await settings.listHolidays(aditya, { year: yearOf(d), month: monthOf(d) });
  assert.ok(verna.some((h) => h.date === d));
  assert.ok(!panaji.some((h) => h.date === d));
  await assert.rejects(settings.listHolidays(aditya, { year: yearOf(d), locationId: 2 }), /own location/);
  if (yearOf(d) === yearOf(today)) {
    const v = await leave.previewLeave(ravi, { leaveTypeCode: 'CL', from: d, to: d, halfDay: false, reason: 'test' });
    assert.equal(v.days, 0, 'holiday not counted as leave at Verna');
  }
});

test('A regularisation request changes attendance only after manager approval (A5)', async () => {
  const pending = await attendance.listPendingRegularisations(rohan);
  const joel = pending.find((p) => p.full_name.startsWith('Joel'))!;
  assert.ok(joel, 'seeded request is in the manager inbox');
  const before = await ctx.db.query<{ check_out: Date | null }>(`select check_out from attendance where employee_id = $1 and date = $2`, [joel.employee_id, joel.date]);
  assert.equal(before[0]?.check_out ?? null, null, 'still a missed punch while pending');
  await assert.rejects(attendance.decideRegularisation(ravi, joel.id, 'APPROVED', ''), { name: 'ForbiddenError' });
  await attendance.decideRegularisation(rohan, joel.id, 'APPROVED', 'ok');
  const afterRows = await ctx.db.query<{ check_out: Date; source: string }>(`select check_out, source from attendance where employee_id = $1 and date = $2`, [joel.employee_id, joel.date]);
  assert.ok(afterRows[0].check_out);
  assert.equal(afterRows[0].source, 'REGULARISATION');
});

test('Team view: a manager sees direct reports only; an employee is refused (A6)', async () => {
  const team = await attendance.getTeamToday(rohan);
  assert.ok(team.length >= 7);
  assert.ok(team.every((t) => t.location_name === 'Verna Plant'));
  assert.ok(!team.some((t) => t.full_name.startsWith('Aditya')));
  await assert.rejects(attendance.getTeamToday(ravi), { name: 'ForbiddenError' });
  assert.ok((await attendance.getTeamToday(hr)).length >= 19);
});

// ================================================================ Leave
test('An employee who joined on 1 July sees pro-rated CL and SL', async () => {
  const b = await leave.getBalances(meera);
  assert.equal(b.find((x) => x.code === 'CL')!.accrued, yearOf(today) === 2026 ? 4 : 8);
  assert.equal(b.find((x) => x.code === 'SL')!.accrued, yearOf(today) === 2026 ? 3.5 : 7);
});

test('Applying for leave Friday to Monday at head office counts 2 days, not 4', async () => {
  const fri = next(5);
  const mon = addDays(fri, 3);
  const p = await leave.previewLeave(aditya, { leaveTypeCode: 'CL', from: fri, to: mon, halfDay: false, reason: 'Trip' });
  if (yearOf(fri) === yearOf(mon)) assert.equal(p.days, 2);
  const plant = await leave.previewLeave(ravi, { leaveTypeCode: 'CL', from: fri, to: mon, halfDay: false, reason: 'Trip' });
  if (yearOf(fri) === yearOf(mon)) assert.equal(plant.days, 3, 'Saturday is a working day at the plant');
});

test('Applying for more CL than available offers conversion to LOP', async () => {
  const from = next(1, addDays(today, 30)); // a Monday ~5 weeks out
  const to = addDays(from, 4);              // Mon–Fri = 5 working days at Panaji
  if (yearOf(from) !== yearOf(to)) return;
  const b = (await leave.getBalances(aditya)).find((x) => x.code === 'CL')!;
  const p = await leave.previewLeave(aditya, { leaveTypeCode: 'CL', from, to: addDays(from, 14), halfDay: false, reason: 'Long trip' });
  if (yearOf(addDays(from, 14)) !== yearOf(from)) return;
  assert.equal(p.ok, false);
  assert.ok(p.lopOffer);
  assert.equal(p.lopOffer!.paidDays, Math.floor(b.canApply! * 2) / 2);
  await assert.rejects(leave.applyLeave(aditya, { leaveTypeCode: 'CL', from, to: addDays(from, 14), halfDay: false, reason: 'Long trip' }), /Loss of Pay/);
  const ok = await leave.applyLeave(aditya, { leaveTypeCode: 'CL', from, to: addDays(from, 14), halfDay: false, reason: 'Long trip', acceptLop: true });
  const row = (await ctx.db.query<{ paid_days: number; lop_days: number }>(`select paid_days, lop_days from leave_requests where id = $1`, [ok.id]))[0];
  assert.equal(row.paid_days + row.lop_days, p.days);
  assert.ok(row.lop_days > 0);
});

test('SL of 3 days cannot be submitted without a certificate', async () => {
  const from = next(2, addDays(today, 40)); const to = addDays(from, 2); // Tue–Thu
  if (yearOf(to) !== yearOf(today)) return;
  await assert.rejects(leave.applyLeave(sneha, { leaveTypeCode: 'SL', from, to, halfDay: false, reason: 'Viral fever' }), /medical certificate/);
  const ok = await leave.applyLeave(sneha, { leaveTypeCode: 'SL', from, to, halfDay: false, reason: 'Viral fever' },
    { fileName: 'cert.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 test').toString('base64'), sizeBytes: 13 });
  assert.ok(ok.id);
  const att = await leave.getAttachment(vikram, ok.id); // her manager can download it
  assert.equal(att.file_name, 'cert.pdf');
  await assert.rejects(leave.getAttachment(ravi, ok.id), { name: 'NotFoundError' });
});

test('Balance does not change while a request is pending, and changes on approval; manager + employee emailed', async () => {
  const from = next(3, addDays(today, 2)); // Wednesday
  if (yearOf(from) !== yearOf(today)) return;
  const before = (await leave.getBalances(anita)).find((b) => b.code === 'CL')!;
  const { id } = await leave.applyLeave(anita, { leaveTypeCode: 'CL', from, to: from, halfDay: false, reason: 'Bank work' });
  const pending = (await leave.getBalances(anita)).find((b) => b.code === 'CL')!;
  assert.equal(pending.available, before.available, 'unchanged while pending');
  assert.equal(pending.pending, before.pending + 1);
  const mail1 = await ctx.db.query<{ to_email: string }>(`select to_email from email_log where related_id = $1`, [id]);
  assert.deepEqual(mail1.map((m) => m.to_email), [rohan.email], 'manager emailed on new request');

  await assert.rejects(leave.decideLeave(ravi, id, 'APPROVED', ''), { name: 'ForbiddenError' }, 'peer cannot approve');
  await leave.decideLeave(rohan, id, 'APPROVED', 'Enjoy');
  const approved = (await leave.getBalances(anita)).find((b) => b.code === 'CL')!;
  assert.equal(approved.available, before.available! - 1, 'drops on approval');
  const mail2 = await ctx.db.query<{ to_email: string; subject: string }>(`select to_email, subject from email_log where related_id = $1 order by id`, [id]);
  assert.equal(mail2[1].to_email, anita.email);
  assert.match(mail2[1].subject, /approved/);

  // Cancelling approved future leave restores the balance
  await leave.cancelLeave(anita, id);
  const restored = (await leave.getBalances(anita)).find((b) => b.code === 'CL')!;
  assert.equal(restored.available, before.available);
  assert.equal(restored.pending, before.pending);
});

test('A manager cannot approve their own leave', async () => {
  const from = next(2, addDays(today, 50));
  if (yearOf(from) !== yearOf(today)) return;
  const { id } = await leave.applyLeave(rohan, { leaveTypeCode: 'CL', from, to: from, halfDay: false, reason: 'Personal' });
  await assert.rejects(leave.decideLeave(rohan, id, 'APPROVED', ''), /own leave/);
  assert.ok(!(await leave.listPendingForApprover(rohan)).some((r) => r.id === id), 'not in own inbox');
  assert.ok((await leave.listPendingForApprover(vikram)).some((r) => r.id === id), 'in his manager\'s inbox');
  await leave.decideLeave(vikram, id, 'APPROVED', '');
});

test('Overlapping requests are refused (DB exclusion constraint)', async () => {
  const from = next(4, addDays(today, 60));
  if (yearOf(from) !== yearOf(today)) return;
  await leave.applyLeave(sneha, { leaveTypeCode: 'CL', from, to: from, halfDay: false, reason: 'One' });
  await assert.rejects(leave.applyLeave(sneha, { leaveTypeCode: 'EL', from, to: from, halfDay: false, reason: 'Two' }), /overlapping/);
});

test('Month-end CSV totals match the calendar for three sample employees (L8)', async () => {
  const y = yearOf(addDays(monthStart(yearOf(today), monthOf(today)), -1));
  const m = monthOf(addDays(monthStart(yearOf(today), monthOf(today)), -1));
  const rep = await reports.monthEndSummary(hr, y, m);
  for (const who of [ravi, anita, aditya]) {
    const cal = await getMonthForEmployee(who, who.id, y, m);
    const row = rep.rows.find((r) => r.employee.id === who.id)!;
    const count = (s: string) => cal.days.filter((d) => d.status === s).length;
    const half = cal.days.filter((d) => d.status === 'HALF_DAY').length;
    assert.equal(row.summary.weeklyOffs, count('WEEKLY_OFF'), `${who.fullName} weekly offs`);
    assert.equal(row.summary.holidays, count('HOLIDAY'), `${who.fullName} holidays`);
    const fullLeave = cal.days.filter((d) => d.status === 'ON_LEAVE').reduce((s, d) => s + Object.values(d.units.leave).reduce((a, b) => a + b, 0), 0);
    assert.equal(Object.values(row.summary.leaveByType).reduce((a, b) => a + b, 0), fullLeave, `${who.fullName} leave`);
    const present = count('PRESENT') + count('WFH') + half * 0.5 + cal.days.filter((d) => d.status === 'ON_LEAVE').reduce((s, d) => s + d.units.present, 0);
    assert.equal(row.summary.daysPresent, present, `${who.fullName} present`);
  }
  // Manager sees only own team in the report; employee refused
  const mine = await reports.monthEndSummary(rohan, y, m);
  assert.ok(mine.rows.every((r) => r.employee.location_name === 'Verna Plant'));
  await assert.rejects(reports.monthEndSummary(ravi, y, m), { name: 'ForbiddenError' });
});
