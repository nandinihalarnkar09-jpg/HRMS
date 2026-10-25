'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { previewLeaveAction, type PreviewResult } from '@/app/(app)/leave/actions';
import { formatDate } from '@/lib/core/dates';
import { Alert, Button, FieldShell, Input, Select, Textarea, cx, fmtDays, inputClass } from './ui';

type TypeOpt = { code: string; name: string; halfDayAllowed: boolean; certAfter: number | null };

/** L3: pick type, dates, full/half day, reason. Working days and balance shown BEFORE submit. */
export function ApplyLeaveForm({ types, initial, minDate }: {
  types: TypeOpt[];
  initial: { type?: string; from?: string; to?: string; reason?: string; halfDay?: boolean };
  minDate: string;
}) {
  const router = useRouter();
  const [type, setType] = useState(initial.type && types.some((t) => t.code === initial.type) ? initial.type : types[0]?.code ?? 'CL');
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? initial.from ?? '');
  const [halfDay, setHalfDay] = useState(Boolean(initial.halfDay));
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

  // Live preview: same server evaluation as submit (debounced)
  useEffect(() => {
    if (!from || !to) { setPreview(null); return; }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await previewLeaveAction({ leaveTypeCode: type, from, to, halfDay, reason: reason || '...', acceptLop, hasCertificate: Boolean(file) });
      if (id !== seq.current) return;
      if ('error' in r) { setPreviewErr(r.error); setPreview(null); } else { setPreviewErr(null); setPreview(r); }
    }, 250);
    return () => clearTimeout(timer);
  }, [type, from, to, halfDay, acceptLop, file, reason]);

  const balanceErrorOnly = preview?.lopOffer && !acceptLop;
  const blocking = preview ? preview.errors.filter((e) => !(preview.lopOffer && /Loss of Pay\?$/.test(e))).filter((e) => !(reason.trim().length < 3 && /short reason/.test(e))) : [];
  const canSubmit = Boolean(preview) && from && to && reason.trim().length >= 3 && blocking.length === 0 && !balanceErrorOnly && (!preview?.needsCertificate || file);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSubmitErr(null);
    const fd = new FormData();
    fd.set('leaveTypeCode', type); fd.set('from', from); fd.set('to', to); fd.set('halfDay', String(halfDay));
    fd.set('reason', reason); fd.set('acceptLop', String(acceptLop));
    if (file) fd.set('certificate', file);
    const res = await fetch('/api/leave/apply', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setSubmitErr(body.error ?? 'Could not submit.'); return; }
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
        <Input label="To" name="to" type="date" required min={from || minDate} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <fieldset className="flex gap-4 text-sm" disabled={!halfAllowed}>
        <legend className="mb-1 text-sm font-medium">Duration</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="dur" checked={!halfDay} onChange={() => setHalfDay(false)} className="size-4" /> Full day</label>
        <label className={cx('flex min-h-11 items-center gap-2', !halfAllowed && 'text-[#93A8D0]')}><input type="radio" name="dur" checked={halfDay} onChange={() => setHalfDay(true)} className="size-4" /> Half day</label>
        {!t?.halfDayAllowed && <span className="self-center text-xs text-muted">({type} has no half days)</span>}
      </fieldset>
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
      <p className="text-xs text-muted">Your balance changes only when your manager approves. Weekly offs and holidays are never counted.</p>
    </form>
  );
}
