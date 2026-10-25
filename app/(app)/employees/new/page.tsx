import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { formOptions } from '@/lib/services/employees';
import { todayIST } from '@/lib/core/dates';
import { EmployeeForm } from '@/components/employee-form';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Add employee' };

export default async function NewEmployee() {
  const actor = await getActor();
  if (!actor.isHrAdmin) notFound();
  const options = await formOptions(actor);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Add employee" subtitle="The employee code (KCF####) is generated automatically." />
      <Card><EmployeeForm mode="create" options={options} initial={{ state: 'Goa', date_of_joining: todayIST(), salary_grade: 'G1' }} /></Card>
    </div>
  );
}
