'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEmployeeAction, updateEmployeeAction } from '@/app/(app)/employees/actions';
import { INDIAN_STATES_AND_UTS, GENDERS } from '@/lib/core/validation';
import type { ActionState } from '@/lib/actions';
import { Alert, Button, Input, Select, cx } from './ui';

type Opt = { id: string | number; label: string };
type Values = Record<string, string | boolean | null | undefined>;

const STEPS = [
  { key: 'personal', title: 'Personal', fields: ['full_name', 'email', 'mobile', 'dob', 'gender', 'address_line1', 'address_line2', 'city', 'state', 'pincode'] },
  { key: 'job', title: 'Job', fields: ['date_of_joining', 'designation', 'department_id', 'location_id', 'reporting_manager_id', 'salary_grade', 'is_hr_admin'] },
  { key: 'statutory', title: 'Statutory', fields: ['pan', 'aadhaar', 'uan'] },
  { key: 'bank', title: 'Bank', fields: ['account_number', 'ifsc', 'bank_name', 'account_holder_name'] },
  { key: 'emergency', title: 'Emergency', fields: ['emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone'] },
];

/** E1 / edit: multi-step form; every Indian field validated on the server (messages shown per field). */
export function EmployeeForm({ mode, id, initial, options, masked }: {
  mode: 'create' | 'edit'; id?: string; initial: Values;
  options: { departments: Opt[]; locations: Opt[]; managers: Opt[] };
  masked?: { pan: string; aadhaar: string; uan: string; account: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const fe = state.fieldErrors ?? {};
  const v = (k: string) => (initial[k] === null || initial[k] === undefined ? '' : String(initial[k]));
  const stepHasError = (i: number) => STEPS[i].fields.some((f) => fe[f]);
  const edit = mode === 'edit';
  const statHint = (m?: string) => (edit ? `Current: ${m ?? '—'}. Leave blank to keep it.` : undefined);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = edit ? await updateEmployeeAction(id!, fd) : await createEmployeeAction(fd);
      setState(r);
      if (r.ok) { router.push(`/employees/${(r.data as { id: string }).id}?saved=1`); router.refresh(); return; }
      const first = STEPS.findIndex((s) => s.fields.some((f) => r.fieldErrors?.[f]));
      if (first >= 0) setStep(first);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}
              className={cx('rounded-full border px-3 py-1 text-sm', i === step ? 'border-brand bg-brand text-white' : 'border-line bg-white',
                stepHasError(i) && i !== step && 'border-danger text-danger')}>
              {i + 1}. {s.title}{stepHasError(i) ? ' ⚠' : ''}
            </button>
          </li>
        ))}
      </ol>

      {state.error && !state.ok && <Alert kind="error">{state.error}</Alert>}

      <div className={cx('grid gap-4 md:grid-cols-2', step !== 0 && 'hidden')}>
        <Input label="Full name" name="full_name" required defaultValue={v('full_name')} error={fe.full_name} />
        <Input label="Work email (used to sign in)" name="email" type="email" required defaultValue={v('email')} error={fe.email} />
        <Input label="Mobile" name="mobile" inputMode="numeric" required defaultValue={v('mobile')} error={fe.mobile} hint="10 digits starting with 6–9" />
        <Input label="Date of birth" name="dob" type="date" required defaultValue={v('dob')} error={fe.dob} hint="Must be 18+ on the joining date" />
        <Select label="Gender" name="gender" required defaultValue={v('gender')} error={fe.gender} placeholder="Choose…" options={GENDERS.map((g) => ({ value: g, label: g }))} />
        <Input label="Address line 1" name="address_line1" required defaultValue={v('address_line1')} error={fe.address_line1} />
        <Input label="Address line 2" name="address_line2" defaultValue={v('address_line2')} />
        <Input label="City" name="city" required defaultValue={v('city')} error={fe.city} />
        <Select label="State / UT" name="state" required defaultValue={v('state') || 'Goa'} error={fe.state} options={INDIAN_STATES_AND_UTS.map((s) => ({ value: s, label: s }))} />
        <Input label="PIN code" name="pincode" inputMode="numeric" maxLength={6} required defaultValue={v('pincode')} error={fe.pincode} />
      </div>

      <div className={cx('grid gap-4 md:grid-cols-2', step !== 1 && 'hidden')}>
        <Input label="Date of joining" name="date_of_joining" type="date" required defaultValue={v('date_of_joining')} error={fe.date_of_joining} />
        <Input label="Designation" name="designation" required defaultValue={v('designation')} error={fe.designation} />
        <Select label="Department" name="department_id" required defaultValue={v('department_id')} error={fe.department_id} placeholder="Choose…" options={options.departments.map((o) => ({ value: o.id, label: o.label }))} />
        <Select label="Location" name="location_id" required defaultValue={v('location_id')} error={fe.location_id} placeholder="Choose…" options={options.locations.map((o) => ({ value: o.id, label: o.label }))} />
        <Select label="Reporting manager" name="reporting_manager_id" defaultValue={v('reporting_manager_id')} error={fe.reporting_manager_id} placeholder="— None (top of organisation) —"
          options={options.managers.filter((o) => o.id !== id).map((o) => ({ value: o.id, label: o.label }))} hint="Cannot be the employee or someone who reports to them" />
        <Input label="Salary grade" name="salary_grade" required defaultValue={v('salary_grade') || 'G1'} error={fe.salary_grade} />
        <input type="hidden" name="is_hr_admin_present" value="1" />
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="is_hr_admin" defaultChecked={Boolean(initial.is_hr_admin)} className="size-4" /> HR Admin (full access; audited)</label>
      </div>

      <div className={cx('grid gap-4 md:grid-cols-2', step !== 2 && 'hidden')}>
        <Input label="PAN" name="pan" required={!edit} autoComplete="off" className="uppercase" maxLength={10} placeholder={edit ? '' : 'ABCDE1234F'} error={fe.pan} hint={statHint(masked?.pan) ?? '5 letters, 4 digits, 1 letter'} />
        <Input label="Aadhaar" name="aadhaar" required={!edit} autoComplete="off" inputMode="numeric" maxLength={14} error={fe.aadhaar} hint={statHint(masked?.aadhaar) ?? '12 digits; it will only ever be shown as XXXX XXXX 1234'} />
        <Input label="UAN (PF)" name="uan" autoComplete="off" inputMode="numeric" maxLength={12} error={fe.uan} hint={statHint(masked?.uan) ?? 'Optional for new joiners; 12 digits'} />
      </div>

      <div className={cx('grid gap-4 md:grid-cols-2', step !== 3 && 'hidden')}>
        <Input label="Account number" name="account_number" required={!edit} autoComplete="off" inputMode="numeric" error={fe.account_number} hint={statHint(masked?.account) ?? '9–18 digits'} />
        <Input label="IFSC" name="ifsc" required={!edit} className="uppercase" maxLength={11} defaultValue={edit ? '' : ''} error={fe.ifsc} hint={edit ? 'Leave blank to keep it.' : '4 letters, 0, then 6 letters/digits (e.g. SBIN0001234)'} />
        <Input label="Bank name" name="bank_name" required={!edit} error={fe.bank_name} hint={edit ? 'Leave blank to keep it.' : undefined} />
        <Input label="Account holder name" name="account_holder_name" required={!edit} defaultValue={edit ? '' : ''} error={fe.account_holder_name} hint={edit ? 'Leave blank to keep it.' : undefined} />
      </div>

      <div className={cx('grid gap-4 md:grid-cols-2', step !== 4 && 'hidden')}>
        <Input label="Emergency contact name" name="emergency_contact_name" required defaultValue={v('emergency_contact_name')} error={fe.emergency_contact_name} />
        <Input label="Relation" name="emergency_contact_relation" required defaultValue={v('emergency_contact_relation')} error={fe.emergency_contact_relation} />
        <Input label="Emergency contact phone" name="emergency_contact_phone" inputMode="numeric" required defaultValue={v('emergency_contact_phone')} error={fe.emergency_contact_phone} />
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</Button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 && <Button type="button" variant="secondary" onClick={() => setStep(step + 1)}>Next →</Button>}
          <Button disabled={pending}>{pending ? 'Saving…' : edit ? 'Save changes' : 'Create employee'}</Button>
        </div>
      </div>
    </form>
  );
}
