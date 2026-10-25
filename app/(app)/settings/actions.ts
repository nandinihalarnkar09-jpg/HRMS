'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { str, toState, type ActionState } from '@/lib/actions';
import * as s from '@/lib/services/settings';
import { runCarryForward, adjustBalance } from '@/lib/services/leave';

const done = (message: string): ActionState => { revalidatePath('/', 'layout'); return { ok: true, message }; };
const num = (v: string) => (v.trim() === '' ? null : Number(v));

export async function addHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await s.addHoliday(actor, { date: str(fd, 'date'), name: str(fd, 'name'), type: str(fd, 'type'), locationIds: fd.getAll('locationIds').map(Number) });
    return done('Holiday added.');
  });
}

export async function deleteHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => { await s.deleteHoliday(actor, Number(str(fd, 'id'))); return done('Holiday removed.'); });
}

export async function weeklyOffsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => { await s.updateLocationWeeklyOffs(actor, Number(str(fd, 'id')), fd.getAll('days').map(Number)); return done('Weekly offs saved.'); });
}

export async function addLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await s.addLocation(actor, { code: str(fd, 'code').toUpperCase(), name: str(fd, 'name'), city: str(fd, 'city'), state: str(fd, 'state') || 'Goa', weeklyOffDays: fd.getAll('days').map(Number) });
    return done('Location added.');
  });
}

export async function addDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => { await s.addDepartment(actor, str(fd, 'name')); return done('Department added.'); });
}

export async function updateLeaveTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await s.updateLeaveType(actor, Number(str(fd, 'id')), {
      name: str(fd, 'name'), annualQuota: num(str(fd, 'annualQuota')), accrualMethod: str(fd, 'accrualMethod'), monthlyRate: num(str(fd, 'monthlyRate')),
      carryForwardMax: Number(str(fd, 'carryForwardMax') || 0), halfDayAllowed: fd.get('halfDayAllowed') === 'on', isActive: fd.get('isActive') === 'on',
      certRequiredAfterDays: num(str(fd, 'certRequiredAfterDays')), perEventDays: num(str(fd, 'perEventDays')),
    });
    return done('Leave type saved. Balances are recalculated automatically.');
  });
}

export async function updatePolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => { await s.updatePolicyDoc(actor, Number(str(fd, 'id')), str(fd, 'body')); return done('Policy text saved. The assistant answers from this text only.'); });
}

export async function carryForwardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await runCarryForward(actor, Number(str(fd, 'year')));
    return done(`Opening balances for ${Number(str(fd, 'year')) + 1} set for ${r.employees} employees (EL capped at the carry-forward limit; CL/SL lapse).`);
  });
}

export async function adjustBalanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await adjustBalance(actor, str(fd, 'employeeId'), str(fd, 'code'), Number(str(fd, 'year')), Number(str(fd, 'delta')), str(fd, 'reason'));
    return done('Balance adjusted and audited.');
  });
}
