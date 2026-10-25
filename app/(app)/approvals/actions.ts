'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { str, toState, type ActionState } from '@/lib/actions';
import { decideRegularisation } from '@/lib/services/attendance';

export async function decideRegularisationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  const decision = str(fd, 'decision') === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  return toState(async () => {
    await decideRegularisation(actor, str(fd, 'id'), decision, str(fd, 'comment'));
    revalidatePath('/', 'layout');
    return { ok: true, message: decision === 'APPROVED' ? 'Approved. Attendance updated.' : 'Rejected.' };
  });
}
