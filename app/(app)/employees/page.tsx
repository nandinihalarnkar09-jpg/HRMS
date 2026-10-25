import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { formOptions, listEmployees } from '@/lib/services/employees';
import { formatDate } from '@/lib/core/dates';
import { Card, EmptyState, LinkButton, PageHeader, Table, btnClass, inputClass, td } from '@/components/ui';

export const metadata = { title: 'Employees' };

export default async function Directory({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; loc?: string; status?: string }> }) {
  const actor = await getActor();
  if (!actor.isHrAdmin) notFound(); // HR only (E2)
  const sp = await searchParams;
  const status = (['active', 'inactive', 'all'].includes(sp.status ?? '') ? sp.status : 'active') as 'active' | 'inactive' | 'all';
  const [rows, opts] = await Promise.all([
    listEmployees(actor, { q: sp.q, departmentId: Number(sp.dept) || undefined, locationId: Number(sp.loc) || undefined, status }),
    formOptions(actor),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Employees" subtitle={`${rows.length} shown`}
        actions={<>
          <a href="/api/employees/export" className={btnClass('secondary')}>⇩ CSV (masked)</a>
          <LinkButton href="/employees/new">+ Add employee</LinkButton>
        </>} />
      <Card>
        <form className="mb-4 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search name, code or email" aria-label="Search" className={inputClass()} />
          <select name="dept" defaultValue={sp.dept ?? ''} aria-label="Department" className={inputClass()}>
            <option value="">All departments</option>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <select name="loc" defaultValue={sp.loc ?? ''} aria-label="Location" className={inputClass()}>
            <option value="">All locations</option>{opts.locations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <select name="status" defaultValue={status} aria-label="Status" className={inputClass()}>
            <option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
          </select>
          <button className={btnClass('primary')}>Filter</button>
        </form>
        {rows.length === 0 ? <EmptyState>No employees match these filters.</EmptyState> : (
          <Table head={['Code', 'Name', 'Department', 'Location', 'Manager', 'Joined', 'Status']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} tabular font-medium`}>{r.employee_code}</td>
                <td className={td}><Link className="font-medium text-brand hover:underline" href={`/employees/${r.id}`}>{r.full_name}</Link><span className="block text-xs text-muted">{r.designation}{r.is_hr_admin ? ' · HR Admin' : ''}</span></td>
                <td className={td}>{r.department_name}</td>
                <td className={td}>{r.location_name}</td>
                <td className={td}>{r.manager_name ?? '—'}</td>
                <td className={td}>{formatDate(r.date_of_joining)}</td>
                <td className={td}>{r.active ? <span className="text-success">Active</span> : <span className="text-muted">Exited {formatDate(r.last_working_day)}</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
