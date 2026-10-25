import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { formOptions, getEmployeeProfile, getStatutoryMasked } from '@/lib/services/employees';
import { EmployeeForm } from '@/components/employee-form';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Edit employee' };

export default async function EditEmployee({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor.isHrAdmin) notFound();
  const { id } = await params;
  const [p, masked, options] = await Promise.all([
    getEmployeeProfile(actor, id).catch(() => null), getStatutoryMasked(actor, id).catch(() => null), formOptions(actor),
  ]);
  if (!p) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`Edit ${p.full_name}`} subtitle={`${p.employee_code} · every change to job or statutory fields is audited`} />
      <Card>
        <EmployeeForm mode="edit" id={p.id} options={options}
          masked={masked ? { pan: masked.pan, aadhaar: masked.aadhaar, uan: masked.uan, account: masked.account } : undefined}
          initial={{ ...p, department_id: String(p.department_id), location_id: String(p.location_id) }} />
      </Card>
    </div>
  );
}
