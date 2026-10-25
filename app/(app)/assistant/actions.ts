'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { toState, type ActionState } from '@/lib/actions';
import { confirmDraft, discardDraft } from '@/lib/services/drafts';

/** The human confirmation step for every agent write (guardrail). */
export async function confirmDraftAction(id: string): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await confirmDraft(actor, id);
    revalidatePath('/', 'layout');
    return { ok: true, message: r.kind === 'LEAVE_REQUEST' ? 'Leave request submitted. Your manager has been emailed.' : `Sent ${r.ref}.` };
  });
}

export async function discardDraftAction(id: string): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => { await discardDraft(actor, id); return { ok: true, message: 'Draft discarded. Nothing was submitted.' }; });
}
