/**
 * Integration-test harness: a fresh database per test file, migrated and seeded, with the
 * services wired to it. Needs TEST_DATABASE_URL pointing at a Postgres server where the user
 * may CREATE DATABASE (e.g. postgres://postgres@localhost:5432/postgres).
 */
import { createTestDb } from '../helpers/pgwire';
import { setDb } from '../../lib/db';
import { runMigrations } from '../../scripts/migrate';
import { seed } from '../../scripts/seed';
import { resolveActor } from '../../lib/services/identity';
import type { Actor } from '../../lib/core/authz';
import { todayIST } from '../../lib/core/dates';

export async function setupTestDb(name: string) {
  const base = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/postgres';
  const admin = await createTestDb(base);
  const dbName = `lehar_test_${name}_${process.pid}`;
  await admin.exec(`drop database if exists ${dbName}`);
  await admin.exec(`create database ${dbName}`);
  await admin.close();
  const u = new URL(base); u.pathname = `/${dbName}`;
  const db = await createTestDb(u.toString());
  await runMigrations((s) => db.exec(s), (t, p) => db.query(t, p), () => undefined);
  await seed(db, { log: () => undefined });
  setDb(db);
  const actorFor = async (first: string): Promise<Actor> => {
    const rows = await db.query<{ email: string }>(`select email from employees where email like $1`, [`${first.toLowerCase()}.%`]);
    const r = await resolveActor({ email: rows[0].email }, { q: db, today: todayIST() });
    if (r.status !== 'ok') throw new Error(`${first}: ${r.status}`);
    return r.actor;
  };
  const cleanup = async () => {
    setDb(null);
    await db.close();
    const a = await createTestDb(base);
    await a.exec(`drop database if exists ${dbName}`);
    await a.close();
  };
  return { db, actorFor, cleanup };
}
