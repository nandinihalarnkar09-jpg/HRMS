import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { monthEndSummary } from '@/lib/services/reports';
import { parseMonth } from '@/lib/month-param';
import { Alert, Card, EmptyState, LinkButton, PageHeader, Table, btnClass, fmtDays, td } from '@/components/ui';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const actor = await getActor();
  if (!actor.isManager && !actor.isHrAdmin) notFound();
  const mp = parseMonth((await searchParams).m);
  let data: Awaited<ReturnType<typeof monthEndSummary>> | null = null;
  let error: string | null = null;
  try { data = await monthEndSummary(actor, mp.year, mp.month); } catch (e) { error = e instanceof Error ? e.message : 'Could not build the report.'; }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Month-end summary" subtitle={`${data?.label ?? mp.key} · ${actor.isHrAdmin ? 'all employees' : 'your team'} · for the payroll vendor`}
        actions={<>
          <LinkButton variant="secondary" size="sm" href={`?m=${mp.prev}`}>← {mp.prev}</LinkButton>
          <LinkButton variant="secondary" size="sm" href={`?m=${mp.next}`}>{mp.next} →</LinkButton>
          {data && <a className={btnClass('primary', 'sm')} href={`/api/reports/month-end?y=${mp.year}&m=${mp.month}`}>⇩ Download CSV</a>}
        </>} />
      {error && <Alert kind="error">{error}</Alert>}
      {data && (
        <Card>
          {data.rows.length === 0 ? <EmptyState>No employees in scope for this month.</EmptyState> : (
            <Table head={['Code', 'Name', 'Present', 'WFH', ...data.leaveCodes, 'LOP', 'Holidays', 'Weekly offs', 'Late', 'Missed punch']}>
              {data.rows.map(({ employee: e, summary: s }) => (
                <tr key={e.id}>
                  <td className={`${td} tabular`}>{e.employee_code}</td>
                  <td className={td}>{e.full_name}<span className="block text-xs text-muted">{e.location_name}</span></td>
                  <td className={`${td} tabular`}>{fmtDays(s.daysPresent)}</td>
                  <td className={`${td} tabular`}>{fmtDays(s.wfhDays)}</td>
                  {data!.leaveCodes.map((c) => <td key={c} className={`${td} tabular`}>{fmtDays(s.leaveByType[c] ?? 0)}</td>)}
                  <td className={`${td} tabular font-semibold`}>{fmtDays(s.lopDays)}{s.latePenalty > 0 && <span className="block text-xs font-normal text-muted">incl. {s.latePenalty} late</span>}</td>
                  <td className={`${td} tabular`}>{s.holidays}</td>
                  <td className={`${td} tabular`}>{s.weeklyOffs}</td>
                  <td className={`${td} tabular`}>{s.lateCount}</td>
                  <td className={`${td} tabular`}>{s.missedPunches}</td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs text-muted">Built from the same day-status rules as the attendance calendar. LOP = absences + LOP leave + ½ day for every 3 Late marks. The CSV contains no PAN, Aadhaar or bank data.</p>
        </Card>
      )}
    </div>
  );
}
