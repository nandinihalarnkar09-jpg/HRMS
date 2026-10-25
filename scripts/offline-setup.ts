/**
 * npm run offline:setup → creates the offline database in ./.pglite (migrations + seed) and runs a
 * quick self-check through the real services. Safe to re-run: it only seeds an empty database.
 */
import { createPgliteDb } from '../lib/db/pglite';
import { setDb } from '../lib/db';
import { runMigrations } from './migrate';
import { seed } from './seed';
import { resolveActor } from '../lib/services/identity';
import { getBalances, previewLeave } from '../lib/services/leave';
import { getTeamToday } from '../lib/services/attendance';
import { addDays, todayIST, weekdayOf } from '../lib/core/dates';
import { ensureLocalLogins } from '../lib/services/local-auth';

async function main() {
  const dir = process.env.PGLITE_DIR || './.pglite';
  const db = await createPgliteDb(dir);
  setDb(db);
  await runMigrations((s) => db.exec(s), (t, p) => db.query(t, p));
  const n = (await db.query<{ n: number }>(`select count(*)::int as n from employees`))[0].n;
  if (n === 0) {
    const { logins } = await seed(db);
    console.log('\nTest users (pick one on the login page):');
    console.table(logins);
  } else console.log(`✓ database already has ${n} employees`);
  const created = await ensureLocalLogins(db);
  console.log(`✓ sign-in passwords ready (${created} new). Password for everyone: <firstname>@KCF2026, e.g. priya@KCF2026`);

  // Self-check through the same services the screens use
  const who = async (first: string) => {
    const e = (await db.query<{ email: string }>(`select email from employees where email like $1`, [`${first}.%`]))[0];
    const r = await resolveActor({ email: e.email }, { q: db });
    if (r.status !== 'ok') throw new Error(`${first}: ${r.status}`);
    return r.actor;
  };
  const aditya = await who('aditya');
  const rohan = await who('rohan');
  const cl = (await getBalances(aditya)).find((b) => b.code === 'CL');
  let fri = addDays(todayIST(), 1); while (weekdayOf(fri) !== 5) fri = addDays(fri, 1);
  const p = await previewLeave(aditya, { leaveTypeCode: 'CL', from: fri, to: addDays(fri, 3), halfDay: false, reason: 'check' });
  const team = await getTeamToday(rohan);
  console.log(`✓ self-check: Aditya CL available ${cl?.available}; Fri→Mon at head office = ${p.days} days; Rohan's team today = ${team.length} people`);
  await db.close();
  console.log('\nOFFLINE SETUP OK');
}
main().catch((e) => { console.error('OFFLINE SETUP FAILED:', e); process.exit(1); });
