import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { getTeamLeaveCalendar } from '@/lib/services/leave';
import { dayOf, monthName, weekdayName } from '@/lib/core/dates';
import { parseMonth } from '@/lib/month-param';
import { Card, EmptyState, LinkButton, PageHeader, cx } from '@/components/ui';

export const metadata = { title: 'Leave calendar' };

/** L7: team leave on a month calendar to spot clashes. */
export default async function LeaveCalendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const actor = await getActor();
  if (!actor.isManager && !actor.isHrAdmin) notFound();
  const mp = parseMonth((await searchParams).m);
  const cal = await getTeamLeaveCalendar(actor, mp.year, mp.month);
  const clash = new Set(cal.clashDates);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Leave calendar" subtitle={`${monthName(mp.month)} ${mp.year} · approved and pending leave`}
        actions={<><LinkButton variant="secondary" size="sm" href={`?m=${mp.prev}`}>← {mp.prev}</LinkButton><LinkButton variant="secondary" size="sm" href={`?m=${mp.next}`}>{mp.next} →</LinkButton></>} />
      <Card>
        {cal.members.length === 0 ? <EmptyState>No team members.</EmptyState> : (
          <div className="-mx-4 overflow-x-auto md:mx-0">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left">Employee</th>
                  {cal.days.map((d) => (
                    <th key={d} className={cx('px-0.5 py-1 font-medium', clash.has(d) ? 'bg-[#FEE2E2] text-[#991B1B]' : 'text-muted')} title={clash.has(d) ? 'Two or more people away' : undefined}>
                      <span className="block">{weekdayName(d)[0]}</span>{dayOf(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cal.members.map((m) => (
                  <tr key={m.id} className="border-t border-line/70">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-medium">{m.name}</th>
                    {cal.days.map((d) => {
                      const c = m.cells[d];
                      return (
                        <td key={d} className="p-0.5">
                          <span className={cx('flex h-7 w-8 items-center justify-center rounded text-[10px] font-bold',
                            !c ? 'bg-white' : c.status === 'APPROVED' ? 'bg-[#DBEAFE] text-[#1E40AF]' : 'border border-dashed border-[#92400E] bg-[#FEF3C7] text-[#92400E]')}
                            title={c ? `${c.code} ${c.status.toLowerCase()}${c.half ? ' (half day)' : ''}` : undefined}>
                            {c ? `${c.code}${c.half ? '½' : ''}` : ''}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <span><span className="mr-1 inline-block h-3 w-4 rounded bg-[#DBEAFE]" />Approved</span>
          <span><span className="mr-1 inline-block h-3 w-4 rounded border border-dashed border-[#92400E] bg-[#FEF3C7]" />Pending</span>
          <span><span className="mr-1 inline-block h-3 w-4 rounded bg-[#FEE2E2]" />Clash: 2+ people away</span>
        </p>
      </Card>
    </div>
  );
}
