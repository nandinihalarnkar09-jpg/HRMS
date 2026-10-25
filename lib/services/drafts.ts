/**
 * Agent drafts: nothing the agent prepares is submitted until the user clicks Confirm (guardrail).
 */
import { getDb } from '@/lib/db';
import { NotFoundError, ValidationError, type Actor } from '@/lib/core/authz';
import { applyLeave, type LeaveInput } from './leave';
import { sendEmail } from './email';

export type DraftRow = { id: string; employee_id: string; kind: 'LEAVE_REQUEST' | 'HR_REMINDER_EMAIL'; payload: Record<string, unknown>; status: string; result_ref: string | null };

export async function createDraft(actor: Actor, kind: DraftRow['kind'], payload: Record<string, unknown>): Promise<string> {
  const rows = await getDb().query<{ id: string }>(
    `insert into agent_drafts (employee_id, kind, payload) values ($1,$2,$3::jsonb) returning id`, [actor.id, kind, JSON.stringify(payload)]);
  return rows[0].id;
}

async function loadOwnDraft(actor: Actor, id: string): Promise<DraftRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const rows = await getDb().query<DraftRow>(`select * from agent_drafts where id = $1`, [id]);
  const d = rows[0];
  if (!d || d.employee_id !== actor.id) throw new NotFoundError('Draft not found.'); // only your own drafts
  if (d.status !== 'DRAFT') throw new ValidationError(`This draft was already ${d.status.toLowerCase()}.`);
  return d;
}

export async function getDraft(actor: Actor, id: string) {
  return loadOwnDraft(actor, id);
}

/** Confirm = run the NORMAL apply/send path with the draft's values (same validation). */
export async function confirmDraft(actor: Actor, id: string): Promise<{ kind: DraftRow['kind']; ref: string }> {
  const d = await loadOwnDraft(actor, id);
  let ref: string;
  if (d.kind === 'LEAVE_REQUEST') {
    const p = d.payload as unknown as LeaveInput & { needsCertificate?: boolean };
    if (p.needsCertificate) throw new ValidationError('This leave needs a medical certificate. Use the Apply leave form to attach it.');
    const r = await applyLeave(actor, { leaveTypeCode: p.leaveTypeCode, from: p.from, to: p.to, halfDay: p.halfDay, reason: p.reason, acceptLop: p.acceptLop });
    ref = r.id;
  } else {
    if (!actor.isHrAdmin) throw new ValidationError('Only HR can send reminder emails.');
    const p = d.payload as { emails: { to: string; subject: string; text: string }[] };
    const q = getDb();
    for (const m of p.emails) await sendEmail(q, { to: m.to, subject: m.subject, text: m.text, relatedId: id });
    ref = `${p.emails.length} email(s)`;
  }
  await getDb().query(`update agent_drafts set status = 'CONFIRMED', result_ref = $2, decided_at = now() where id = $1`, [id, ref]);
  return { kind: d.kind, ref };
}

export async function discardDraft(actor: Actor, id: string) {
  await loadOwnDraft(actor, id);
  await getDb().query(`update agent_drafts set status = 'DISCARDED', decided_at = now() where id = $1`, [id]);
}
