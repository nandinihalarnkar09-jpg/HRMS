/** Driver-neutral DB interface (production: postgres.js; tests: tests/helpers/pgwire.ts). */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Run fn in a transaction on a dedicated connection. Rolls back on throw. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

/** Format a JS array as a Postgres array literal (send as text, cast in SQL: $1::uuid[]). */
export function pgArray(values: (string | number)[]): string {
  return '{' + values.map((v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`).join(',') + '}';
}

/** Postgres error helpers (codes: https://www.postgresql.org/docs/current/errcodes-appendix.html) */
export function pgErrorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}
export function pgConstraint(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'constraint_name' in e ? String((e as { constraint_name: unknown }).constraint_name ?? '') : undefined;
}
