/**
 * Email via Resend's REST API (L6). Never throws: a failed email must not undo a leave approval.
 * Every attempt is recorded in email_log (SENT / SKIPPED when no key / FAILED).
 */
import type { Queryable } from '@/lib/db';

export type EmailInput = { to: string; subject: string; text: string; relatedId?: string | null };

export function appUrl(path = '') {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '') + path;
}

export async function sendEmail(q: Queryable, msg: EmailInput): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
  const key = process.env.RESEND_API_KEY;
  const redirect = process.env.EMAIL_REDIRECT_TO;
  const to = redirect || msg.to;
  const subject = redirect ? `[for ${msg.to}] ${msg.subject}` : msg.subject;
  let status: 'SENT' | 'SKIPPED' | 'FAILED' = 'SKIPPED';
  let error: string | null = key ? null : 'RESEND_API_KEY not set; email logged only';

  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Lehar HR <onboarding@resend.dev>', to: [to], subject, text: msg.text }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) status = 'SENT';
      else { status = 'FAILED'; error = `${res.status} ${(await res.text()).slice(0, 300)}`; }
    } catch (e) {
      status = 'FAILED'; error = e instanceof Error ? e.message : String(e);
    }
  }
  try {
    await q.query(
      `insert into email_log (to_email, subject, body, status, error, related_id) values ($1,$2,$3,$4,$5,$6)`,
      [msg.to, msg.subject, msg.text, status, error, msg.relatedId ?? null]);
  } catch { /* logging must never break the caller */ }
  return status;
}
