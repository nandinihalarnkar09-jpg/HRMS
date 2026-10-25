'use server';
import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/auth/actor';
import { str, toState, type ActionState } from '@/lib/actions';
import * as emp from '@/lib/services/employees';
import type { EmployeeFormInput } from '@/lib/core/validation';

const FIELDS = ['full_name', 'email', 'mobile', 'dob', 'gender', 'address_line1', 'address_line2', 'city', 'state', 'pincode',
  'date_of_joining', 'designation', 'department_id', 'location_id', 'reporting_manager_id', 'salary_grade',
  'pan', 'aadhaar', 'uan', 'account_number', 'ifsc', 'bank_name', 'account_holder_name',
  'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone'] as const;

function readForm(fd: FormData): Partial<EmployeeFormInput> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (fd.has(f)) out[f] = str(fd, f);
  if (fd.has('is_hr_admin_present')) out.is_hr_admin = fd.get('is_hr_admin') === 'on';
  return out as Partial<EmployeeFormInput>;
}

export async function createEmployeeAction(fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await emp.createEmployee(actor, readForm(fd) as EmployeeFormInput);
    revalidatePath('/employees');
    return { ok: true, message: `Created ${r.employee_code}.`, data: { id: r.id } };
  });
}

export async function updateEmployeeAction(id: string, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await emp.updateEmployee(actor, id, readForm(fd));
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Saved. Changes are in the audit trail.', data: { id } };
  });
}

export async function updateContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await emp.updateContact(actor, str(fd, 'id'), readForm(fd));
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Contact details saved.' };
  });
}

export async function deactivateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    const r = await emp.deactivateEmployee(actor, str(fd, 'id'), str(fd, 'last_working_day'), str(fd, 'reason'));
    revalidatePath('/', 'layout');
    return { ok: true, message: `Last working day set. They cannot sign in after that date.${r.openReports ? ` ${r.openReports} people still report to them; please reassign.` : ''}` };
  });
}

export async function reactivateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await getActor();
  return toState(async () => {
    await emp.reactivateEmployee(actor, str(fd, 'id'), 'Reactivated by HR');
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Reactivated.' };
  });
}

/** R-EMP-11: HR Reveal (PAN / bank account only), audited in the service. */
export async function revealAction(id: string, field: 'pan' | 'account_number'): Promise<{ value?: string; error?: string }> {
  const actor = await getActor();
  try { return { value: await emp.revealSensitive(actor, id, field) }; }
  catch (e) { return { error: e instanceof Error ? e.message : 'Not allowed.' }; }
}
