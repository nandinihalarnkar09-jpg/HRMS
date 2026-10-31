'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { previewLeaveAction, type PreviewResult } from '@/app/(app)/leave/actions';
import { formatDate } from '@/lib/core/dates';
import { HALF_DAY_SESSION_LABEL, HALF_DAY_SESSIONS, type HalfDaySession } from '@/lib/core/leave-rules';
import { Alert, Button, FieldShell, Input, Select, Textarea, cx, fmtDays, inputClass } from './ui';

type TypeOpt = { code: string; name: string; halfDayAllowed: boolean; certAfter: number | null };

/** L3: pick type, dates, full/half day, reason. Working days and balance shown BEFORE submit. */
export function ApplyLeaveForm({ types, initial, minDate, today }: {
  types: TypeOpt[];
  initial: { type?: string; from?: string; to?: string; reason?: string; halfDay?: boolean; session?: HalfDaySession };
  minDate: string;
  /** IST today, for the back-dated hint */
  today: string;
}) {
  const router = useRouter();
  const [type, setType] = useState(initial.type && types.some((t) => t.code === initial.type) ? initial.type : types[0]?.code ?? 'CL');
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? initial.from ?? '');
  const [halfDay, setHalfDay] = useState(Boolean(initial.halfDay));
  const [session, setSession] = useState<HalfDaySession | ''>(initial.session ?? '');
  const [reason, setReason] = useState(initial.reason ?? '');
  const [acceptLop, setAcceptLop] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const seq = useRef(0);

  const t = types.find((x) => x.code === type);
  const halfAllowed = Boolean(t?.halfDayAllowed) && from !== '' && from === to;
  useEffect(() => { if (!halfAllowed && halfDay) setHalfDay(false); }, [halfAllowed, halfDay]);
  useEffect(() => { setAcceptLop(false); }, [type, from, to, halfDay]);
  const sessionMissing = halfDay && !session;

  // Live preview: same server evaluation as submit (debounced)
  useEffect(() => {
    if (!from || !to) { setPreview(null); return; }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await previewLeaveAction({ leaveTypeCode: type, from, to, halfDay, halfDaySession: halfDay ? session || null : null, reason: reason || '...', acceptLop, hasCertificate: Boolean(file) });
      if (id !== seq.current) return;
      if ('error' in r) { setPreviewErr(r.error); setPreview(null); } else { setPreviewErr(null); setPreview(r); }
    }, 250);
    return () => clearTimeout(timer);
  }, [type, from, to, halfDay, session, acceptLop, file, reason]);

  const balanceErrorOnly = preview?.lopOffer && !acceptLop;
  const blocking = preview ? preview.errors.filter((e) => !(preview.lopOffer && /Loss of Pay\?$/.test(e))).filter((e) => !(reason.trim().length < 3 && /short reason/.test(e))).filter((e) => !(sessionMissing && /which half/.test(e))) : [];
  // Say WHY the button is disabled, instead of leaving a silent grey button
  const missing: string[] = [];
  if (!from || !to) missing.push('pick the from and to dates');
  if (sessionMissing) missing.push('choose the time slot (first or second half)');
  if (reason.trim().length < 3) missing.push('write a short reason (at least 3 letters)');
  if (preview?.needsCertificate && !file) missing.push('attach the medical certificate');
  if (balanceErrorOnly) missing.push('tick the Loss of Pay box, or shorten the dates');
  if (from && to && !preview && !previewErr) missing.push('wait a moment while the days are counted');
  const canSubmit = Boolean(preview) && from && to && reason.trim().length >= 3 && blocking.length === 0 && !balanceErrorOnly && (!preview?.needsCertificate || file) && !sessionMissing;
  const isPast = Boolean(from) && from < today;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSubmitErr(null);
    const fd = new FormData();
    fd.set('leaveTypeCode', type); fd.set('from', from); fd.set('to', to); fd.set('halfDay', String(halfDay));
    if (halfDay && session) fd.set('halfDaySession', session);
    fd.set('reason', reason); fd.set('acceptLop', String(acceptLop));
    if (file) fd.set('certificate', file);
    let res: Response;
    try {
      res = await fetch('/api/leave/apply', { method: 'POST', body: fd });
    } catch {
      setSubmitting(false);
      setSubmitErr('Could not reach the server. Check your internet connection and try again.');
      return;
    }
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.status === 401) { setSubmitErr('Your sign-in has expired. Please sign in again, then resubmit.'); return; }
    if (!res.ok) { setSubmitErr(body.error ?? `Could not submit (error ${res.status}). Please try again.`); return; }
    router.push('/leave?applied=1');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Select label="Leave type" name="type" value={type} onChange={(e) => setType(e.target.value)} required
        options={types.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
      {preview?.balance && (
        <p className="tabular -mt-2 text-sm text-muted">
          {preview.balance.unlimited ? 'Unlimited (unpaid)'
            : preview.balance.perEvent !== null ? `Up to ${preview.balance.perEvent} days per event`
              : <>Available <b className="text-ink">{fmtDays(preview.balance.available)}</b> · Pending {fmtDays(preview.balance.pending)} · You can apply for up to <b className="text-ink">{fmtDays(preview.balance.canApply)}</b></>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input label="From" name="from" type="date" required min={minDate} value={from} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} />
        <Input label="To" name="to" type="date" required min={from || minDate} max={from ? `${from.slice(0, 4)}-12-31` : undefined} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <p className="-mt-2 text-xs text-muted">
        {isPast ? <>This is <b className="text-ink">back-dated leave</b>. Once approved, those days change from Absent to On Leave.</>
          : <>Past dates are allowed too (back-dated leave), from {formatDate(minDate)}.</>}
      </p>
      <fieldset className="flex gap-4 text-sm" disabled={!halfAllowed}>
        <legend className="mb-1 text-sm font-medium">Duration</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="dur" checked={!halfDay} onChange={() => setHalfDay(false)} className="size-4" /> Full day</label>
        <label className={cx('flex min-h-11 items-center gap-2', !halfAllowed && 'text-[#93A8D0]')}><input type="radio" name="dur" checked={halfDay} onChange={() => setHalfDay(true)} className="size-4" /> Half day</label>
        {!t?.halfDayAllowed && <span className="self-center text-xs text-muted">({type} has no half days)</span>}
      </fieldset>
      {halfDay && halfAllowed && (
        <fieldset className="-mt-2 flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-sm font-medium">Time slot <span className="text-danger">*</span></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {HALF_DAY_SESSIONS.map((s) => (
              <label key={s} className={cx('flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border bg-white px-3 py-2 transition-colors',
                session === s ? 'border-brand ring-2 ring-brand-soft' : 'border-line hover:border-brand')}>
                <input type="radio" name="session" value={s} checked={session === s} onChange={() => setSession(s)} className="size-4" />
                <span>{HALF_DAY_SESSION_LABEL[s]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">{session === 'FIRST' ? 'You will start work after lunch. A late check-in that day is not marked Late.'
            : session === 'SECOND' ? 'You will leave after the morning half. Check in as usual.'
              : 'Choose the half of the day you will be away.'}</p>
        </fieldset>
      )}
      <Textarea label="Reason" name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function in Ponda" />

      {/* live preview */}
      <div aria-live="polite" className="rounded-[var(--radius-control)] border border-line bg-brand-50 p-3 text-sm">
        {!from || !to ? <p className="text-muted">Pick dates to see how many working days this is.</p>
          : !preview ? <p className="text-muted">{previewErr ?? 'Calculating…'}</p> : (
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold">{fmtDays(preview.days)} working day{preview.days === 1 ? '' : 's'}{preview.lopDays > 0 && acceptLop ? ` (${fmtDays(preview.paidDays)} ${type} + ${fmtDays(preview.lopDays)} LOP)` : ''}</p>
              {preview.excluded.length > 0 && (
                <p className="text-xs text-muted">Not counted: {preview.excluded.map((x) => `${formatDate(x.date)} (${x.reason === 'HOLIDAY' ? x.name : 'weekly off'})`).join(', ')}</p>
              )}
            </div>
          )}
      </div>

      {preview?.lopOffer && (
        <Alert kind="warning">
          <p>You can apply for only {fmtDays(preview.balance?.canApply ?? 0)} {type}. Convert the extra <b>{fmtDays(preview.lopOffer.lopDays)}</b> day(s) to Loss of Pay?</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" className="size-4" checked={acceptLop} onChange={(e) => setAcceptLop(e.target.checked)} />
            Yes, use {fmtDays(preview.lopOffer.paidDays)} {type} + {fmtDays(preview.lopOffer.lopDays)} LOP
          </label>
        </Alert>
      )}

      {preview?.needsCertificate && (
        <FieldShell label="Medical certificate (required for SL over 2 days)" name="certificate" required hint="PDF, JPG or PNG, up to 2 MB">
          <input id="certificate" type="file" accept="application/pdf,image/jpeg,image/png" className={inputClass()}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FieldShell>
      )}

      {blocking.length > 0 && <Alert kind="error"><ul className="list-disc pl-4">{blocking.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      {submitErr && <Alert kind="error">{submitErr}</Alert>}
      <Button size="lg" disabled={!canSubmit || submitting} className="w-full sm:w-auto">{submitting ? 'Submitting…' : 'Submit request'}</Button>
      {!canSubmit && !submitting && missing.length > 0 && (
        <p className="-mt-2 text-sm text-muted" aria-live="polite">To submit, {missing.join(', then ')}.</p>
      )}
      <p className="text-xs text-muted">Your balance changes only when your manager approves. Weekly offs and holidays are never counted.</p>
    </form>
  );
}
