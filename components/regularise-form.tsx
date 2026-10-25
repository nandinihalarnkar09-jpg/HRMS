'use client';
import { useActionState } from 'react';
import { regulariseAction } from '@/app/(app)/attendance/actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Input, Textarea } from './ui';

export function RegulariseForm({ date, employeeId, defaultIn, defaultOut }: { date: string; employeeId?: string; defaultIn?: string; defaultOut?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(regulariseAction, {});
  return (
    <form action={action} className="flex flex-col gap-3" key={date}>
      <input type="hidden" name="date" value={date} />
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Actual check-in (IST)" name="inTime" type="time" required defaultValue={defaultIn ?? '09:00'} />
        <Input label="Actual check-out (IST)" name="outTime" type="time" required defaultValue={defaultOut ?? '18:00'} />
      </div>
      <Textarea label="Reason" name="reason" required minLength={5} placeholder="e.g. Forgot to check out; left at 6 pm" />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.message && <Alert kind="success">{state.message}</Alert>}
      <Button disabled={pending}>{pending ? 'Sending…' : 'Request correction'}</Button>
    </form>
  );
}
