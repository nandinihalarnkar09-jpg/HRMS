'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { str, toState, type ActionState } from '@/lib/actions';
import * as leave from '@/lib/services/leave';

export type PreviewResult = {
  ok: boolean; errors: string[]; days: number; paidDays: number; lopDays: number; needsCertificate: boolean;
  lopOffer: { paidDays: number; lopDays: number } | null;
  excluded: { date: string; reason: string; name: string }[];
  balance: { available: number | null; pending: number; canApply: number | null; perEvent: number | null; unlimited: boolean } | null;
  typeName: string;
};

/** Live preview for the Apply form (no writes). Same evaluation as submit. */
export async function previewLeaveAction(input: leave.LeaveInput & { hasCertificate?: boolean }): Promise<PreviewResult | { error: string }> {
  const actor = await getActor();
  try {
    const p = await leave.previewLeave(actor, input, Boolean(input.hasCertificate));
    return {
      ok: p.ok, errors: p.errors, days: p.days, paidDays: p.paidDays, lopDays: p.lopDays, needsCertificate: p.needsCertificate,
      lopOffer: p.lopOffer, excluded: p.excluded, typeName: p.type.name,
      balance: p.balance ? { available: p.balance.available, pending: p.balance.pending, canApply: p.balance.canApply, perEvent: p.balance.perEvent, unlimited: p.balance.unlimited } : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not preview.' };
  }
}

export async function cancelLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await leave.cancelLeave(actor, str(fd, 'id'));
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Request cancelled. Your balance has been restored.' };
  });
}

export async function decideLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  const decision = str(fd, 'decision') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  return toState(async () => {
    await leave.decideLeave(actor, str(fd, 'id'), decision, str(fd, 'comment'));
    revalidatePath('/', 'layout');
    return { ok: true, message: decision === 'APPROVED' ? 'Approved. The employee has been emailed.' : 'Rejected. The employee has been emailed.' };
  });
}
