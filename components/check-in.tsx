'use client';
import { useState, useTransition } from 'react';
import { checkInAction, checkOutAction, wfhAction } from '@/app/(app)/attendance/actions';
import type { ActionState } from '@/lib/actions';
import { Alert, Button } from './ui';

/** A1/A3: one click each. The server decides the time (IST), never the browser. */
export function CheckInPanel({ checkedIn, checkedOut, isWfh, workingDay }: { checkedIn: boolean; checkedOut: boolean; isWfh: boolean; workingDay: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  const run = (fn: () => Promise<ActionState>) => start(async () => setState(await fn()));

  return (
    <div className="flex flex-col gap-2">
      {!checkedIn && (
        <>
          <Button size="lg" className="w-full" disabled={pending} onClick={() => run(checkInAction)}>
            {pending ? 'Saving…' : 'Check in'}
          </Button>
          <Button variant="secondary" className="w-full" disabled={pending} onClick={() => run(wfhAction)}>
            Working from home today
          </Button>
          {!workingDay && <p className="text-xs text-muted">Today is not a working day at your location. You can still check in if you are working.</p>}
        </>
      )}
      {checkedIn && !checkedOut && !isWfh && (
        <Button size="lg" className="w-full" disabled={pending} onClick={() => run(checkOutAction)}>
          {pending ? 'Saving…' : 'Check out'}
        </Button>
      )}
      {checkedIn && !checkedOut && isWfh && (
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => run(checkOutAction)}>
          {pending ? 'Saving…' : 'End WFH day (optional check-out)'}
        </Button>
      )}
      {checkedOut && <p className="text-sm text-muted">Done for today. See you tomorrow!</p>}
      {state?.message && <Alert kind="success">{state.message}</Alert>}
      {state?.error && <Alert kind="error">{state.error}</Alert>}
    </div>
  );
}
