/**
 * Agent guardrails, tested WITHOUT a model: the tools themselves enforce roles, never leak
 * identifiers, log every call and stop after 5. (The live-model attack prompts are in
 * tests/agent/prompts.json → npm run test:agent.)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDb } from './helpers';
import type { Actor } from '../../lib/core/authz';
import { addDays, todayIST, weekdayOf, yearOf, monthOf } from '../../lib/core/dates';
import * as T from '../../lib/agent/tool-impl';
import { guardUnsupportedNumbers } from '../../lib/agent/guard';
import { systemPrompt } from '../../lib/agent/prompt';
import { getBalances } from '../../lib/services/leave';
import { confirmDraft } from '../../lib/services/drafts';

let ctx: Awaited<ReturnType<typeof setupTestDb>>;
let hr: Actor, rohan: Actor, ravi: Actor, aditya: Actor, sneha: Actor;
const today = todayIST();
const nextFri = (() => { let d = addDays(today, 1); while (weekdayOf(d) !== 5) d = addDays(d, 1); return d; })();

before(async () => {
  ctx = await setupTestDb('agent');
  [hr, rohan, ravi, aditya, sneha] = await Promise.all(['priya', 'rohan', 'ravi', 'aditya', 'sneha'].map((n) => ctx.actorFor(n)));
});
after(async () => { await ctx.cleanup(); });

test('"How many CL do I have?" returns the same number as the My leave screen', async () => {
  const c = T.newContext(aditya);
  const r = await T.getMyLeaveBalance(c, {}) as { balances: { code: string; available: number }[] };
  const screen = await getBalances(aditya);
  assert.equal(r.balances.find((b) => b.code === 'CL')!.available, screen.find((b) => b.code === 'CL')!.available);
});

test('"Leave Friday to Monday" = 2 days at head office via count_working_days', async () => {
  const mon = addDays(nextFri, 3);
  if (yearOf(mon) !== yearOf(nextFri)) return;
  const r = await T.countWorkingDays(T.newContext(aditya), { from_date: nextFri, to_date: mon }) as { working_days: number; not_counted: string[] };
  assert.equal(r.working_days, 2);
  assert.equal(r.not_counted.length, 2);
  const plant = await T.countWorkingDays(T.newContext(ravi), { from_date: nextFri, to_date: mon }) as { working_days: number };
  assert.equal(plant.working_days, 3);
});

test('A drafted leave request is not submitted until the user clicks Confirm', async () => {
  const c = T.newContext(sneha);
  const d = addDays(nextFri, 7);
  if (yearOf(d) !== yearOf(today)) return;
  const r = await T.draftLeaveRequest(c, { leave_type_code: 'CL', from_date: d, to_date: d, reason: 'Personal work' }) as { draft_created: boolean; draft_id: string; submitted: boolean };
  assert.equal(r.draft_created, true);
  assert.equal(r.submitted, false);
  const before = await ctx.db.query(`select 1 from leave_requests where employee_id = $1 and from_date = $2`, [sneha.id, d]);
  assert.equal(before.length, 0, 'nothing in leave_requests yet');
  await assert.rejects(confirmDraft(ravi, r.draft_id), { name: 'NotFoundError' }, "someone else cannot confirm my draft");
  await confirmDraft(sneha, r.draft_id);
  const afterRows = await ctx.db.query<{ status: string }>(`select status from leave_requests where employee_id = $1 and from_date = $2`, [sneha.id, d]);
  assert.equal(afterRows[0].status, 'PENDING');
  await assert.rejects(confirmDraft(sneha, r.draft_id), /already confirmed/);
});

test('Draft offers LOP conversion instead of silently overspending', async () => {
  const from = addDays(nextFri, 17); const to = addDays(from, 25);
  if (yearOf(to) !== yearOf(today)) return;
  const r = await T.draftLeaveRequest(T.newContext(aditya), { leave_type_code: 'CL', from_date: from, to_date: to, reason: 'Long trip' }) as { draft_created: boolean; lop_offer: unknown };
  assert.equal(r.draft_created, false);
  assert.ok(r.lop_offer);
});

test('An employee asking for team attendance is refused; a manager gets only direct reports', async () => {
  const e = await T.teamToday(T.newContext(ravi), {}) as { error?: string };
  assert.equal(e.error, 'FORBIDDEN');
  const m = await T.teamToday(T.newContext(rohan), {}) as { people: { name: string }[]; scope: string };
  assert.equal(m.scope, 'your direct reports');
  assert.ok(!m.people.some((p) => p.name.startsWith('Aditya')));
  const pend = await T.summarisePending(T.newContext(ravi), {}) as { error?: string };
  assert.equal(pend.error, 'FORBIDDEN');
  const mine = await T.summarisePending(T.newContext(rohan), {}) as { requests: { employee: string; clash_warnings: string[] }[] };
  assert.ok(mine.requests.length >= 1);
});

test('A policy question not covered by the policy text gets "not found", not a guess', async () => {
  const r = await T.explainPolicy(T.newContext(ravi), { question: 'What is the gym membership reimbursement?' }) as { found: boolean };
  assert.equal(r.found, false);
  const ok = await T.explainPolicy(T.newContext(ravi), { question: 'Is there a sandwich rule for weekends?' }) as { found: boolean; sections: { text: string }[] };
  assert.equal(ok.found, true);
  assert.ok(ok.sections.some((s) => /sandwich/i.test(s.text)));
  const hinglish = await T.explainPolicy(T.newContext(ravi), { question: 'bimar hone par certificate kab chahiye?' }) as { found: boolean };
  assert.equal(hinglish.found, true);
});

test('Holidays come from the user’s own location only', async () => {
  const r = await T.getHolidays(T.newContext(aditya), { year: 2026, month: 9 }) as { holidays: { name: string }[] };
  if (yearOf(today) === 2026) assert.ok(!r.holidays.some((h) => /2nd day/.test(h.name)), 'Verna-only holiday hidden from Panaji');
  const v = await T.getHolidays(T.newContext(ravi), { year: 2026, month: 9 }) as { holidays: { name: string }[] };
  if (yearOf(today) === 2026) assert.ok(v.holidays.some((h) => /2nd day/.test(h.name)));
});

test('Month-end check is HR-only and drafts (does not send) reminder emails', async () => {
  assert.equal((await T.monthEndCheck(T.newContext(rohan), {}) as { error?: string }).error, 'FORBIDDEN');
  const r = await T.monthEndCheck(T.newContext(hr), { year: yearOf(today), month: monthOf(today) }) as { flagged: unknown[]; draft_created: boolean };
  if (r.draft_created) {
    const sent = await ctx.db.query(`select 1 from email_log where subject like 'Attendance reminder%'`);
    assert.equal(sent.length, 0, 'nothing sent before confirmation');
  }
  assert.ok(!JSON.stringify(r).includes('@'), 'model never sees email addresses');
});

test('Every tool call appears in agent_log; the 6th call in one question is refused', async () => {
  const c = T.newContext(ravi);
  for (let i = 0; i < 5; i++) await T.getMyLeaveBalance(c, {});
  const sixth = await T.getMyLeaveBalance(c, {}) as { error?: string };
  assert.equal(sixth.error, 'TOOL_LIMIT');
  const logged = await ctx.db.query<{ ok: boolean }>(`select ok from agent_log where request_id = $1 order by id`, [c.requestId]);
  assert.equal(logged.length, 6);
  assert.deepEqual(logged.map((l) => l.ok), [true, true, true, true, true, false]);
});

test('No tool result ever contains a full Aadhaar, PAN or account number', async () => {
  const ids = await ctx.db.query<{ aadhaar: string; pan: string }>(`select aadhaar, pan from employee_statutory`);
  const accts = await ctx.db.query<{ account_number: string }>(`select account_number from employee_bank`);
  const results = await ctx.db.query<{ result: unknown }>(`select result from agent_log`);
  const blob = JSON.stringify(results);
  for (const r of ids) { assert.ok(!blob.includes(r.aadhaar)); assert.ok(!blob.includes(r.pan)); }
  for (const a of accts) assert.ok(!blob.includes(a.account_number));
});

test('Numbers come from code: a numeric answer without a tool call is replaced', () => {
  assert.match(guardUnsupportedNumbers('You have 10 CL left.', []), /check that in the system/);
  assert.equal(guardUnsupportedNumbers('You have 6.5 CL left.', [{ tool: 'get_my_leave_balance' }]), 'You have 6.5 CL left.');
  assert.equal(guardUnsupportedNumbers('I cannot share Aadhaar numbers.', []), 'I cannot share Aadhaar numbers.');
});

test('System prompt has today in IST, location, and the "always use a tool" rule; no PII', () => {
  const p = systemPrompt(ravi, { name: 'Verna Plant', weeklyOffs: 'Sunday' }, new Date('2026-10-25T19:00:00Z'));
  assert.match(p, /2026-10-26/, 'IST date (00:30 IST on the 26th)');
  assert.match(p, /Verna Plant/);
  assert.match(p, /NUMBERS COME FROM TOOLS/);
  assert.ok(!p.includes(ravi.email));
});
