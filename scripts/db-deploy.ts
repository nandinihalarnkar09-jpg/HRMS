/**
 * Runs on every Vercel build (npm run vercel-build). Idempotent:
 *  1. apply any new db/migrations/*.sql
 *  2. seed the sample company ONLY if the database has no employees
 *  3. give every employee a demo password (AUTH_MODE=password) if they have none
 * Never drops, truncates or re-seeds existing data.
 */
import postgres from 'postgres';
import type { Db, Queryable } from '../lib/db/types';
import { runMigrations } from './migrate';
import { seed } from './seed';
import { ensureLocalLogins } from '../lib/services/local-auth';

async function main() {
  const env = process.env;
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_POSTGRES_URL_NON_POOLING || env.POSTGRES_URL_NON_POOLING
    || env.DATABASE_URL || env.DATABASE_POSTGRES_URL || env.POSTGRES_URL;
  if (!url) { console.warn('db-deploy: DATABASE_URL not set, skipping database setup'); return; }
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

  await runMigrations((s) => sql.unsafe(s).simple(), (t, p) => db.query(t, p));
  const n = (await db.query<{ n: number }>(`select count(*)::int as n from employees`))[0].n;
  if (n === 0) { await seed(db, { log: () => undefined }); console.log('✓ seeded sample company'); }
  else console.log(`✓ database already has ${n} employees (not re-seeded)`);
  if (process.env.AUTH_MODE === 'password') console.log(`✓ demo passwords ready (${await ensureLocalLogins(db)} new)`);
  await sql.end();
}

main().catch((e) => { console.error('db-deploy FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
