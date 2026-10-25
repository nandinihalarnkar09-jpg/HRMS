import type { Queryable } from '@/lib/db';
import { getDb } from '@/lib/db';
import { maskForAudit } from '@/lib/core/masking';
import { ForbiddenError, type Actor } from '@/lib/core/authz';

export type AuditEntry = {
  tableName: string;
  recordId: string;
  subjectEmployeeId: string | null;
  action: 'CREATE' | 'UPDATE' | 'REVEAL' | 'DEACTIVATE' | 'ATTENDANCE_CORRECTION' | 'REGULARISATION_APPROVED' | 'BALANCE_ADJUSTMENT' | 'SETTINGS';
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
};

/** Write audit rows. Sensitive values are ALWAYS masked before storage (R-EMP-12). */
export async function writeAudit(q: Queryable, changedBy: string | null, entries: AuditEntry[]) {
  for (const e of entries) {
    const f = e.field ?? null;
    await q.query(
      `insert into audit_log (table_name, record_id, subject_employee_id, action, field, old_value, new_value, reason, changed_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.tableName, e.recordId, e.subjectEmployeeId, e.action, f,
        f ? maskForAudit(f, e.oldValue ?? null) : (e.oldValue ?? null),
        f ? maskForAudit(f, e.newValue ?? null) : (e.newValue ?? null),
        e.reason ?? null, changedBy],
    );
  }
}

export type AuditRow = {
  id: number; action: string; field: string | null; old_value: string | null; new_value: string | null;
  reason: string | null; changed_at: Date; changed_by_name: string | null; table_name: string;
};

/** Audit trail for one employee: HR only. */
export async function listAuditForEmployee(actor: Actor, employeeId: string): Promise<AuditRow[]> {
  if (!actor.isHrAdmin) throw new ForbiddenError('Only HR Admin can view the audit trail.');
  return getDb().query<AuditRow>(
    `select a.id, a.action, a.field, a.old_value, a.new_value, a.reason, a.changed_at, a.table_name,
            c.full_name as changed_by_name
       from audit_log a left join employees c on c.id = a.changed_by
      where a.subject_employee_id = $1
      order by a.changed_at desc, a.id desc limit 200`, [employeeId]);
}
