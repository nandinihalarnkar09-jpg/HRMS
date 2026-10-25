import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { getTeamMonth, getTeamToday } from '@/lib/services/attendance';
import { dayOf, formatTimeIST, monthName, todayIST, weekdayName } from '@/lib/core/dates';
import { summariseMonth } from '@/lib/core/summary';
import { parseMonth } from '@/lib/month-param';
import { TeamCorrectionForm } from '@/components/team-correction-form';
import { Card, EmptyState, LinkButton, PageHeader, STATUS_META, StatusBadge, StatusLegend, Table, cx, fmtDays, td } from '@/components/ui';

export const metadata = { title: 'Team attendance' };

export default async function TeamAttendance({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const actor = await getActor();
  if (!actor.isManager && !actor.isHrAdmin) notFound(); // server-side role check
  const mp = parseMonth((await searchParams).m);
  const [today, month] = await Promise.all([getTeamToday(actor), getTeamMonth(actor, mp.year, mp.month)]);
  const dates = month.members[0]?.days.map((d) => d.date) ?? [];
  const members = month.members.map((m) => ({ id: m.employee.id, label: `${m.employee.full_name} (${m.employee.employee_code})` }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Team attendance" subtitle={actor.isHrAdmin ? 'All employees' : 'Your direct reports'} />
      <Card title={`Today · ${todayIST()}`}>
        {today.length === 0 ? <EmptyState>No one in your team.</EmptyState> : (
          <Table head={['Employee', 'Location', 'Status', 'In', 'Out']}>
            {today.map((r) => (
              <tr key={r.id}>
                <td className={td}><span className="font-medium">{r.full_name}</span><span className="block text-xs text-muted">{r.employee_code} · {r.designation}</span></td>
                <td className={td}>{r.location_name}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {r.status === 'IN_PROGRESS' && !r.checkIn ? <span className="text-xs text-muted">Not checked in yet</span> : <StatusBadge status={r.status} detail={r.leaveTypeCode ?? r.detail} />}
                    {r.isLate && <StatusBadge status="LATE" compact />}
                  </div>
                </td>
                <td className={`${td} tabular`}>{formatTimeIST(r.checkIn)}</td>
                <td className={`${td} tabular`}>{formatTimeIST(r.checkOut)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={`${monthName(mp.month)} ${mp.year}`} action={<div className="flex gap-2">
        <LinkButton variant="secondary" size="sm" href={`?m=${mp.prev}`}>←</LinkButton>
        <LinkButton variant="secondary" size="sm" href={`?m=${mp.next}`}>→</LinkButton></div>}>
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left">Employee</th>
                {dates.map((d) => <th key={d} className="px-0.5 py-1 font-medium text-muted"><span className="block">{weekdayName(d)[0]}</span>{dayOf(d)}</th>)}
                <th className="px-2 text-muted">Present</th><th className="px-2 text-muted">LOP</th><th className="px-2 text-muted">Late</th>
              </tr>
            </thead>
            <tbody>
              {month.members.map((m) => {
                const s = summariseMonth(m.days);
                return (
                  <tr key={m.employee.id} className="border-t border-line/70">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-medium">{m.employee.full_name}</th>
                    {m.days.map((d) => {
                      const meta = STATUS_META[d.status];
                      return <td key={d.date} className="p-0.5"><span title={`${d.date} ${meta.label}`} className={cx('flex h-7 w-8 items-center justify-center rounded text-[10px] font-bold', meta.cls, d.isLate && 'ring-1 ring-[#9A3412]')}>{meta.code}</span></td>;
                    })}
                    <td className="tabular px-2 text-center">{fmtDays(s.daysPresent)}</td>
                    <td className="tabular px-2 text-center">{fmtDays(s.lopDays)}</td>
                    <td className="tabular px-2 text-center">{s.lateCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4"><StatusLegend /></div>
      </Card>

      <Card title={actor.isHrAdmin ? 'Correct attendance (HR)' : 'Request a correction for a team member'}>
        <p className="mb-3 text-sm text-muted">{actor.isHrAdmin ? 'Direct corrections need a reason and are written to the audit log.' : 'Managers can request a correction; HR approves it before attendance changes.'}</p>
        <TeamCorrectionForm mode={actor.isHrAdmin ? 'hr' : 'manager'} members={members} maxDate={todayIST()} />
      </Card>
    </div>
  );
}
