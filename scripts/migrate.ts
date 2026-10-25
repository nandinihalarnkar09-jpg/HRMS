/** Applies db/migrations/*.sql in order, once each (tracked in schema_migrations). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type Exec = (sql: string) => Promise<unknown>;
export type Query = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

export const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

export async function runMigrations(exec: Exec, query: Query, log: (s: string) => void = console.log) {
  await exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await query<{ name: string }>(`select name from schema_migrations`)).map((r) => r.name));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await exec(`begin;\n${sql}\n;insert into schema_migrations (name) values ('${f.replace(/'/g, "''")}');\ncommit;`);
    log(`✓ migration ${f}`);
  }
}
