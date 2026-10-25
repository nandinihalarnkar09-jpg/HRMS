'use client';
import { useActionState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/actions';
import { Alert, Button } from './ui';

/** Generic small form wrapper for settings actions (shows success/error inline). */
export function ActionForm({ action, children, submit, variant = 'primary', className, confirmText }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; children?: ReactNode; submit: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; className?: string; confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-3'}
      onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={variant} size="sm" disabled={pending}>{pending ? 'Saving…' : submit}</Button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.ok && state.message && <span className="text-sm text-success">{state.message}</span>}
      </div>
      {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && <Alert kind="error">{Object.values(state.fieldErrors).join(' ')}</Alert>}
    </form>
  );
}
