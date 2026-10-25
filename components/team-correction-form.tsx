'use client';
import { useActionState } from 'react';
import { hrCorrectAction, regulariseAction } from '@/app/(app)/attendance/actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Input, Select, Textarea } from './ui';

/** HR: direct correction with reason (R-ATT-08). Manager: request only, approved by HR (D-6). */
export function TeamCorrectionForm({ mode, members, maxDate }: { mode: 'hr' | 'manager'; members: { id: string; label: string }[]; maxDate: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mode === 'hr' ? hrCorrectAction : regulariseAction, {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <Select label="Employee" name="employeeId" required options={members.map((m) => ({ value: m.id, label: m.label }))} placeholder="Choose…" />
      <Input label="Date" name="date" type="date" required max={maxDate} />
      <Input label="Check-in (IST)" name="inTime" type="time" required defaultValue="09:00" />
      <Input label="Check-out (IST)" name="outTime" type="time" required defaultValue="18:00" />
      {mode === 'hr' && (
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="isWfh" className="size-4" /> Work from home</label>
      )}
      <div className="md:col-span-2"><Textarea label={mode === 'hr' ? 'Reason (audited)' : 'Reason'} name="reason" required minLength={5} /></div>
      <div className="flex flex-col gap-2 md:col-span-2">
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
        <Button disabled={pending} className="self-start">{pending ? 'Saving…' : mode === 'hr' ? 'Correct attendance' : 'Send to HR for approval'}</Button>
      </div>
    </form>
  );
}
