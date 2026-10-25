/**
 * DB registry. Services call getDb(); the concrete driver is registered at startup:
 *  - Next.js server: lib/db/client.ts (postgres.js) registers itself (imported by lib/auth/actor.ts)
 *  - tests/scripts: setDb(testDb)
 * Keeping this file driver-free lets services be tested without the postgres.js package.
 */
import type { Db } from './types';
export type { Db, Queryable } from './types';
export { pgArray, pgErrorCode, pgConstraint } from './types';

let instance: Db | null = null;
let factory: (() => Db) | null = null;

export function registerDbFactory(f: () => Db) { factory = f; }
export function setDb(db: Db | null) { instance = db; }

export function getDb(): Db {
  if (instance) return instance;
  if (!factory) throw new Error('No database driver registered (import "@/lib/db/client" on the server).');
  instance = factory();
  return instance;
}
