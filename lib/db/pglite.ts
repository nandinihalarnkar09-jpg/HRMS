/**
 * Offline database (DB_MODE=pglite): a real Postgres compiled to WebAssembly running inside the
 * Node process, storing data in ./.pglite. No server, no internet. Same SQL, migrations and seed
 * as Supabase, so every rule behaves the same. Used by the "Start Lehar HR (offline)" launcher.
 */
import type { Db, Queryable } from './types';

const PARSERS = {
  1082: (v: string) => v,          // date → 'YYYY-MM-DD'
  1700: (v: string) => Number(v),  // numeric → number
  20: (v: string) => Number(v),    // int8 → number
};

export async function createPgliteDb(dataDir: string): Promise<Db & { close(): Promise<void>; exec(sql: string): Promise<void> }> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { btree_gist } = await import('@electric-sql/pglite/contrib/btree_gist');
  const pg = new PGlite(dataDir, { extensions: { btree_gist }, parsers: PARSERS });
  await pg.waitReady;
  await pg.exec(`set timezone = 'Asia/Kolkata'`);
  const wrap = (runner: { query: (t: string, p?: unknown[], o?: unknown) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T,>(text: string, params: unknown[] = []) => (await runner.query(text, params, { parsers: PARSERS })).rows as T[],
  });
  return {
    ...wrap(pg as never),
    tx: <T,>(fn: (q: Queryable) => Promise<T>) => pg.transaction((tx) => fn(wrap(tx as never))) as Promise<T>,
    exec: async (sql: string) => { await pg.exec(sql); },
    close: () => pg.close(),
  };
}
