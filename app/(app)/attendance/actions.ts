'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { str, toState, type ActionState } from '@/lib/actions';
import * as att from '@/lib/services/attendance';
import { formatTimeIST } from '@/lib/core/dates';

export async function checkInAction(): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await att.checkIn(actor);
    revalidatePath('/', 'layout');
    return { ok: true, message: r.created ? `Checked in at ${formatTimeIST(r.record.check_in)}${r.record.is_late ? ' (Late)' : ''}.` : `You already checked in at ${formatTimeIST(r.record.check_in)}.` };
  });
}

export async function checkOutAction(): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await att.checkOut(actor);
    revalidatePath('/', 'layout');
    return { ok: true, message: `Checked out at ${formatTimeIST(r.check_out)}.` };
  });
}

export async function wfhAction(): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await att.markWfh(actor);
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Marked as working from home today. It counts as Present.' };
  });
}

export async function regulariseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await att.requestRegularisation(actor, {
      employeeId: str(fd, 'employeeId') || undefined, date: str(fd, 'date'), inTime: str(fd, 'inTime'), outTime: str(fd, 'outTime'), reason: str(fd, 'reason'),
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Correction requested. Attendance will change once it is approved.' };
  });
}

export async function hrCorrectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await att.hrCorrectAttendance(actor, {
      employeeId: str(fd, 'employeeId'), date: str(fd, 'date'), inTime: str(fd, 'inTime'), outTime: str(fd, 'outTime'),
      isWfh: fd.get('isWfh') === 'on', reason: str(fd, 'reason'),
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Attendance corrected and audited.' };
  });
}
