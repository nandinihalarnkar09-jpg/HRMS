/**
 * npm run db:setup  → apply migrations + seed to DATABASE_URL (Supabase or local Postgres)
 * npm run db:reset  → DROP all Lehar HR tables, then setup again (asks to type the project name)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import postgres from 'postgres';
import type { Db, Queryable } from '../lib/db/types';
import { runMigrations } from './migrate';
import { seed } from './seed';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (put it in .env.local).');
  const sql = postgres(url, {
    prepare: false, max: 1, onnotice: () => undefined,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
    connection: { TimeZone: 'Asia/Kolkata' },
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  const q = (runner: typeof sql | postgres.TransactionSql): Queryable => ({
    query: <T,>(t: string, p: unknown[] = []) => runner.unsafe(t, p as never[]) as unknown as Promise<T[]>,
  });
  const db: Db = { ...q(sql), tx: <T,>(fn: (x: Queryable) => Promise<T>) => sql.begin((tx) => fn(q(tx))) as unknown as Promise<T> };

  if (process.argv.includes('--reset')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('This DELETES ALL Lehar HR data in this database. Type "lehar" to continue: ');
    rl.close();
    if (answer.trim() !== 'lehar') { console.log('Cancelled.'); await sql.end(); return; }
    await sql.unsafe(readFileSync(path.join(process.cwd(), "db", "reset.sql"), "utf8")).simple();
    console.log('✓ dropped');
  }

  await runMigrations((s) => sql.unsafe(s).simple(), (t, p) => db.query(t, p));
  const { logins } = await seed(db);
  console.log('\nTest logins (Clerk dev: sign in with email, verification code 424242):');
  console.table(logins);
  await sql.end();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
