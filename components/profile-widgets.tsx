'use client';
import { useActionState, useState, useTransition } from 'react';
import { deactivateAction, reactivateAction, revealAction, updateContactAction } from '@/app/(app)/employees/actions';
import { INDIAN_STATES_AND_UTS } from '@/lib/core/validation';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Input, Select } from './ui';

/** E7 + R-EMP-11: masked value; HR may Reveal PAN/bank (logged). Aadhaar never gets this. */
export function MaskedValue({ masked, employeeId, field, canReveal }: { masked: string; employeeId: string; field?: 'pan' | 'account_number'; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="tabular font-mono">{value ?? masked}</span>
      {canReveal && field && !value && (
        <button type="button" disabled={pending} className="text-xs font-medium text-brand underline"
          onClick={() => start(async () => { const r = await revealAction(employeeId, field); if (r.value) setValue(r.value); else setErr(r.error ?? 'Not allowed'); })}>
          {pending ? 'Revealing…' : '👁 Reveal (logged)'}
        </button>
      )}
      {value && <button type="button" className="text-xs text-muted underline" onClick={() => setValue(null)}>Hide</button>}
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

/** E5: employee edits own phone, address and emergency contact. */
export function ContactForm({ id, initial }: { id: string; initial: Record<string, string | null> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateContactAction, {});
  const fe = state.fieldErrors ?? {};
  const v = (k: string) => initial[k] ?? '';
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <Input label="Mobile" name="mobile" defaultValue={v('mobile')} error={fe.mobile} required />
      <Input label="Address line 1" name="address_line1" defaultValue={v('address_line1')} error={fe.address_line1} required />
      <Input label="Address line 2" name="address_line2" defaultValue={v('address_line2')} />
      <Input label="City" name="city" defaultValue={v('city')} error={fe.city} required />
      <Select label="State / UT" name="state" defaultValue={v('state')} error={fe.state} options={INDIAN_STATES_AND_UTS.map((s) => ({ value: s, label: s }))} />
      <Input label="PIN code" name="pincode" defaultValue={v('pincode')} error={fe.pincode} maxLength={6} required />
      <Input label="Emergency contact name" name="emergency_contact_name" defaultValue={v('emergency_contact_name')} error={fe.emergency_contact_name} required />
      <Input label="Relation" name="emergency_contact_relation" defaultValue={v('emergency_contact_relation')} error={fe.emergency_contact_relation} required />
      <Input label="Emergency contact phone" name="emergency_contact_phone" defaultValue={v('emergency_contact_phone')} error={fe.emergency_contact_phone} required />
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <Alert kind="success">{state.message}</Alert>}
        <Button disabled={pending} className="self-start">{pending ? 'Saving…' : 'Save contact details'}</Button>
      </div>
    </form>
  );
}

/** E6: HR sets the last working day; the record is never deleted. */
export function DeactivateForm({ id, active, minDate }: { id: string; active: boolean; minDate: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(active ? deactivateAction : reactivateAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      {active ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Last working day" name="last_working_day" type="date" min={minDate} required />
          <Input label="Reason" name="reason" placeholder="e.g. Resigned" required />
        </div>
      ) : <p className="text-sm text-muted">This employee has exited. Reactivating clears the last working day (audited).</p>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="success">{state.message}</Alert>}
      <Button variant={active ? 'danger' : 'secondary'} disabled={pending} className="self-start">{active ? 'Set last working day' : 'Reactivate'}</Button>
    </form>
  );
}
