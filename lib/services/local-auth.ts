/**
 * Local (offline) sign-in: email + password checked against local_logins (scrypt hashes).
 * Used only when AUTH_MODE=dev (never in production; see lib/auth/dev.ts).
 */
import { getDb, type Queryable } from '@/lib/db';
import { defaultPassword, hashPassword, verifyPassword } from '@/lib/auth/password';

let cachedSecret: string | null = null;

export async function getLocalSecret(): Promise<string> {
  if (process.env.LOCAL_AUTH_SECRET) return process.env.LOCAL_AUTH_SECRET;
  if (cachedSecret) return cachedSecret;
  const rows = await getDb().query<{ secret: string }>(`select secret from local_auth_secret limit 1`);
  if (!rows[0]) throw new Error('local_auth_secret missing: run npm run offline:setup');
  cachedSecret = rows[0].secret;
  return cachedSecret;
}

/** Give every employee without a local password the default "<firstname>@KCF2026". */
export async function ensureLocalLogins(q: Queryable): Promise<number> {
  const missing = await q.query<{ id: string; full_name: string }>(
    `select e.id, e.full_name from employees e left join local_logins l on l.employee_id = e.id where l.employee_id is null`);
  for (const e of missing) {
    await q.query(`insert into local_logins (employee_id, password_hash) values ($1,$2)`, [e.id, hashPassword(defaultPassword(e.full_name))]);
  }
  return missing.length;
}

/** Returns the employee email when the password is right, else null (same message for both cases). */
export async function verifyLocalLogin(email: string, password: string): Promise<string | null> {
  const q = getDb();
  const rows = await q.query<{ id: string; email: string; full_name: string; password_hash: string | null }>(
    `select e.id, e.email, e.full_name, l.password_hash from employees e left join local_logins l on l.employee_id = e.id
      where lower(e.email) = lower($1)`, [email.trim()]);
  const r = rows[0];
  if (!r) { hashPassword(password); return null; } // spend similar time when the email is unknown
  if (!r.password_hash) {
    // Employee added later by HR: first sign-in uses the default password, which is then stored hashed
    if (password !== defaultPassword(r.full_name)) return null;
    await q.query(`insert into local_logins (employee_id, password_hash) values ($1,$2) on conflict do nothing`, [r.id, hashPassword(password)]);
    return r.email;
  }
  return verifyPassword(password, r.password_hash) ? r.email : null;
}

export type DemoAccount = { name: string; email: string; password: string; role: string; designation: string; location: string };

/** Sign-in page helper (local mode only): one account per role, with its default password. */
export async function listDemoAccounts(): Promise<DemoAccount[]> {
  const rows = await getDb().query<{ full_name: string; email: string; designation: string; location: string; role: string }>(
    `select e.full_name, e.email, e.designation, l.name as location,
            case when e.is_hr_admin then 'HR Admin'
                 when e.last_working_day is not null and e.last_working_day < app.today_ist() then 'Exited'
                 when exists(select 1 from employees r where r.reporting_manager_id = e.id
                             and (r.last_working_day is null or r.last_working_day >= app.today_ist())) then 'Manager'
                 else 'Employee' end as role
       from employees e join locations l on l.id = e.location_id
      order by case when e.is_hr_admin then 0 else 1 end, e.employee_code`);
  return rows.map((r) => ({ name: r.full_name, email: r.email, password: defaultPassword(r.full_name), role: r.role, designation: r.designation, location: r.location }));
}
