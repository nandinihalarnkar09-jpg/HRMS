/**
 * Signed-in identity → employee row → Actor (ARCHITECTURE §4.1). No Clerk import here, so it is
 * testable; lib/auth/actor.ts supplies the email from Clerk (or the dev login).
 */
import { getDb, type Queryable } from '@/lib/db';
import { todayIST } from '@/lib/core/dates';
import type { Actor } from '@/lib/core/authz';

export type ActorResult =
  | { status: 'ok'; actor: Actor }
  | { status: 'no-record' }
  | { status: 'exited'; lastWorkingDay: string };

type Row = {
  id: string; employee_code: string; full_name: string; email: string; is_hr_admin: boolean;
  location_id: number; last_working_day: string | null; clerk_user_id: string | null;
};

export async function resolveActor(
  identity: { email: string; clerkUserId?: string | null },
  opts: { today?: string; q?: Queryable } = {},
): Promise<ActorResult> {
  const q = opts.q ?? getDb();
  const today = opts.today ?? todayIST();
  const email = identity.email.trim().toLowerCase();

  let rows: Row[] = [];
  if (identity.clerkUserId) {
    rows = await q.query<Row>(`select id, employee_code, full_name, email, is_hr_admin, location_id, last_working_day, clerk_user_id
                                 from employees where clerk_user_id = $1`, [identity.clerkUserId]);
  }
  if (rows.length === 0) {
    rows = await q.query<Row>(`select id, employee_code, full_name, email, is_hr_admin, location_id, last_working_day, clerk_user_id
                                 from employees where lower(email) = $1`, [email]);
    // First login: remember the Clerk user id (checkpoint 5). Never overwrite a different link.
    if (rows[0] && identity.clerkUserId && !rows[0].clerk_user_id) {
      await q.query(`update employees set clerk_user_id = $1 where id = $2 and clerk_user_id is null`, [identity.clerkUserId, rows[0].id]);
    }
  }
  const e = rows[0];
  if (!e) return { status: 'no-record' };
  // R-EMP-13: no access after the last working day (IST)
  if (e.last_working_day && e.last_working_day < today) return { status: 'exited', lastWorkingDay: e.last_working_day };

  // Manager role is DERIVED: anyone who is reporting_manager_id of at least one ACTIVE employee
  const reports = await q.query<{ id: string }>(
    `select id from employees where reporting_manager_id = $1 and (last_working_day is null or last_working_day >= $2)`,
    [e.id, today]);

  return {
    status: 'ok',
    actor: {
      id: e.id, employeeCode: e.employee_code, fullName: e.full_name, email: e.email,
      isHrAdmin: e.is_hr_admin, isManager: reports.length > 0, locationId: e.location_id,
      directReportIds: reports.map((r) => r.id),
    },
  };
}

/** Dev-login picker (only used when AUTH_MODE=dev; see lib/auth/dev.ts). */
export async function listLoginDirectory() {
  return getDb().query<{ email: string; full_name: string; employee_code: string; designation: string; location: string; role: string }>(
    `select e.email, e.full_name, e.employee_code, e.designation, l.name as location,
            case when e.is_hr_admin then 'HR Admin'
                 when e.last_working_day is not null and e.last_working_day < app.today_ist() then 'Exited'
                 when exists(select 1 from employees r where r.reporting_manager_id = e.id
                             and (r.last_working_day is null or r.last_working_day >= app.today_ist())) then 'Manager'
                 else 'Employee' end as role
       from employees e join locations l on l.id = e.location_id
      order by case when e.is_hr_admin then 0 else 1 end, e.employee_code`);
}
