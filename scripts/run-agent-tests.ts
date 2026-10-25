/**
 * npm run test:agent: runs tests/agent/prompts.json against the LIVE agent (needs DATABASE_URL
 * pointing at a seeded DB and an AI key). Prints a pass/fail table. Uses the real tools and
 * writes to agent_log like the app does; drafts are created but never confirmed.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import type { Db, Queryable } from '../lib/db/types';
import { setDb } from '../lib/db';
import { resolveActor } from '../lib/services/identity';
import { runAgent } from '../lib/agent/run';
import { getBalances } from '../lib/services/leave';

type Case = {
  id: string; as: string; prompt: string; note?: string;
  expectTools?: string[]; forbidTools?: string[]; forbidSuccessfulTools?: string[];
  mustMatch?: string[]; mustNotMatch?: string[]; noDraftSubmitted?: boolean; noDecisionMade?: boolean;
  balanceUnchanged?: string; expectBalanceInReply?: string; noEmailSent?: boolean;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const sql = postgres(url, {
    prepare: false, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', connection: { TimeZone: 'Asia/Kolkata' },
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  const q = (r: typeof sql | postgres.TransactionSql): Queryable => ({ query: <T,>(t: string, p: unknown[] = []) => r.unsafe(t, p as never[]) as unknown as Promise<T[]> });
  const db: Db = { ...q(sql), tx: <T,>(fn: (x: Queryable) => Promise<T>) => sql.begin((tx) => fn(q(tx))) as unknown as Promise<T> };
  setDb(db);

  const { cases } = JSON.parse(readFileSync('tests/agent/prompts.json', 'utf8')) as { cases: Case[] };
  const only = process.argv[2];
  const results: { id: string; as: string; pass: boolean; tools: string; problems: string }[] = [];
  for (const c of cases.filter((x) => !only || x.id === only)) {
    const email = (await db.query<{ email: string }>(`select email from employees where email like $1`, [`${c.as}.%`]))[0]?.email;
    const r = await resolveActor({ email });
    if (r.status !== 'ok') { results.push({ id: c.id, as: c.as, pass: false, tools: '', problems: `actor ${r.status}` }); continue; }
    const actor = r.actor;
    const countReq = async () => (await db.query<{ n: number }>(`select count(*)::int as n from leave_requests`))[0].n;
    const countDecided = async () => (await db.query<{ n: number }>(`select count(*)::int as n from leave_requests where decided_at > now() - interval '5 minutes'`))[0].n;
    const countMail = async () => (await db.query<{ n: number }>(`select count(*)::int as n from email_log`))[0].n;
    const before = { req: await countReq(), dec: await countDecided(), mail: await countMail(), bal: c.balanceUnchanged ? (await getBalances(actor)).find((b) => b.code === c.balanceUnchanged)?.available : null };
    const problems: string[] = [];
    let reply = { text: '', calls: [] as { tool: string; ok: boolean; result: unknown }[] };
    try {
      reply = await runAgent(actor, [{ role: 'user', content: c.prompt }]);
    } catch (e) { problems.push(`error: ${e instanceof Error ? e.message : e}`); }
    const used = reply.calls.map((x) => x.tool);
    if (c.expectTools && !c.expectTools.some((t) => used.includes(t))) problems.push(`expected one of ${c.expectTools.join('/')}`);
    for (const t of c.forbidTools ?? []) if (used.includes(t)) problems.push(`called forbidden ${t}`);
    for (const t of c.forbidSuccessfulTools ?? []) if (reply.calls.some((x) => x.tool === t && x.ok)) problems.push(`${t} succeeded but should be refused`);
    for (const m of c.mustMatch ?? []) if (!new RegExp(m, 'i').test(reply.text)) problems.push(`reply lacks /${m}/`);
    for (const m of c.mustNotMatch ?? []) if (new RegExp(m, 'i').test(reply.text)) problems.push(`reply contains /${m}/`);
    if (c.noDraftSubmitted && (await countReq()) !== before.req) problems.push('a leave request was submitted without Confirm');
    if (c.noDecisionMade && (await countDecided()) !== before.dec) problems.push('a decision was made');
    if (c.noEmailSent && (await countMail()) !== before.mail) problems.push('email sent without Confirm');
    if (c.balanceUnchanged) {
      const after = (await getBalances(actor)).find((b) => b.code === c.balanceUnchanged)?.available;
      if (after !== before.bal) problems.push('balance changed');
    }
    if (c.expectBalanceInReply) {
      const b = (await getBalances(actor)).find((x) => x.code === c.expectBalanceInReply)?.available;
      if (b !== undefined && b !== null && !reply.text.includes(String(b))) problems.push(`reply should state ${b} (same as My leave)`);
    }
    results.push({ id: c.id, as: c.as, pass: problems.length === 0, tools: used.join(', '), problems: problems.join('; ') });
    console.log(`${problems.length ? '✗' : '✓'} ${c.id} [${c.as}] ${c.prompt}\n   → ${reply.text.replace(/\n/g, ' ').slice(0, 220)}\n   tools: ${used.join(', ') || '(none)'}${problems.length ? `\n   PROBLEMS: ${problems.join('; ')}` : ''}`);
    await new Promise((res) => setTimeout(res, Number(process.env.AGENT_TEST_DELAY_MS ?? 4000))); // stay inside free-tier RPM
  }
  console.table(results);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await sql.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
