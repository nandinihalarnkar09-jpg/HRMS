'use client';
import { useActionState } from 'react';
import { cancelLeaveAction, decideLeaveAction } from '@/app/(app)/leave/actions';
import { decideRegularisationAction } from '@/app/(app)/approvals/actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, inputClass } from './ui';

export function CancelLeaveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelLeaveAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <Button variant="ghost" size="sm" disabled={pending || state.ok}>{pending ? 'Cancelling…' : state.ok ? 'Cancelled' : 'Cancel'}</Button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}

/** Approve / reject with a comment (L4, A5). Errors show on this row only. */
export function DecisionForm({ id, kind }: { id: string; kind: 'leave' | 'regularisation' }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(kind === 'leave' ? decideLeaveAction : decideRegularisationAction, {});
  if (state.ok) return <Alert kind="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`c-${id}`}>Comment</label>
      <input id={`c-${id}`} name="comment" placeholder="Comment (required to reject)" className={inputClass()} />
      <div className="flex gap-2">
        <Button name="decision" value="APPROVED" size="sm" disabled={pending}>Approve</Button>
        <Button name="decision" value="REJECTED" size="sm" variant="danger" disabled={pending}>Reject</Button>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}
