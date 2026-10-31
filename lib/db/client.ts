import 'server-only';
import postgres from 'postgres';
import type { Db, Queryable } from './types';
import { registerDbFactory } from './index';

/**
 * Production DB client: postgres.js over the Supabase transaction pooler.
 *  - prepare:false is required by the pooler (transaction mode).
 *  - Session time zone is IST (R-ATT-01); dates come back as 'YYYY-MM-DD' strings, numerics as numbers.
 *  - A single client is cached on globalThis so dev hot-reload doesn't open new pools.
 */
type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __leharSql?: Sql; __leharDb?: Db };

function makeSql(): Sql {
  // DATABASE_URL (Supabase/local) or the names Vercel's Neon integration creates
  const url = process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  return postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    connection: { TimeZone: 'Asia/Kolkata', application_name: 'lehar-hr' },
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require',
    types: {
      // Return DATE as the plain 'YYYY-MM-DD' string; never a JS Date (avoids TZ shifts)
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

function wrap(sql: Sql): Db {
  const q = (runner: Sql | postgres.TransactionSql): Queryable => ({
    query: <T,>(text: string, params: unknown[] = []) =>
      runner.unsafe(text, params as never[]) as unknown as Promise<T[]>,
  });
  return {
    ...q(sql),
    tx: <T,>(fn: (tx: Queryable) => Promise<T>) => sql.begin((tx) => fn(q(tx))) as unknown as Promise<T>,
  };
}

registerDbFactory(() => {
  if (process.env.DB_MODE === 'pglite') return pgliteProxy();
  if (!g.__leharDb) {
    g.__leharSql = makeSql();
    g.__leharDb = wrap(g.__leharSql);
  }
  return g.__leharDb;
});

/** Offline mode: lazily open the embedded Postgres once per process (see lib/db/pglite.ts). */
function pgliteProxy(): Db {
  const gg = globalThis as unknown as { __leharPglite?: Promise<Db> };
  const dir = process.env.PGLITE_DIR || './.pglite';
  const ready = () => (gg.__leharPglite ??= import('./pglite').then((m) => m.createPgliteDb(dir)));
  return {
    query: async (t, p) => (await ready()).query(t, p),
    tx: async (fn) => (await ready()).tx(fn),
  };
}
