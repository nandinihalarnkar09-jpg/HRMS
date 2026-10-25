import { getActor } from '@/lib/auth/actor';
import { getMonthForEmployee, listMyRegularisations } from '@/lib/services/attendance';
import { listLocations } from '@/lib/services/settings';
import { addDays, formatDate, formatTimeIST, istTimeOf, monthName, todayIST } from '@/lib/core/dates';
import { summariseMonth } from '@/lib/core/summary';
import { parseMonth } from '@/lib/month-param';
import { MonthCalendar } from '@/components/month-calendar';
import { RegulariseForm } from '@/components/regularise-form';
import { Card, EmptyState, LinkButton, PageHeader, RequestBadge, Stat, StatusBadge, StatusLegend, Table, fmtDays, td } from '@/components/ui';

export const metadata = { title: 'My attendance' };

export default async function MyAttendance({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const mp = parseMonth(sp.m);
  const [{ employee, days }, regs, locations] = await Promise.all([getMonthForEmployee(actor, actor.id, mp.year, mp.month), listMyRegularisations(actor), listLocations()]);
  const offs = (locations.find((l) => l.id === employee.location_id)?.weekly_off_days ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' & ');
  const s = summariseMonth(days);
  const today = todayIST();
  const sel = sp.d ? days.find((d) => d.date === sp.d) : undefined;
  const canRegularise = sel && sel.date <= today && sel.date >= addDays(today, -30) && ['ABSENT', 'HALF_DAY', 'PRESENT', 'IN_PROGRESS'].includes(sel.status)
    && !regs.some((r) => r.date === sel.date && r.status === 'PENDING');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="My attendance" subtitle={`${employee.location_name} · weekly off ${offs || 'none'} · all times IST`}
        actions={<>
          <LinkButton variant="secondary" size="sm" href={`?m=${mp.prev}`}>← {mp.prev}</LinkButton>
          <LinkButton variant="secondary" size="sm" href={`?m=${mp.next}`}>{mp.next} →</LinkButton>
        </>} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Present" value={fmtDays(s.daysPresent)} sub={`incl. ${fmtDays(s.wfhDays)} WFH`} />
        <Stat label="Leave" value={fmtDays(Object.values(s.leaveByType).reduce((a, b) => a + b, 0))} />
        <Stat label="LOP" value={fmtDays(s.lopDays)} sub={s.latePenalty ? `incl. ${s.latePenalty} late penalty` : undefined} />
        <Stat label="Late marks" value={s.lateCount} sub="3 lates = ½ day LOP" />
        <Stat label="Holidays" value={s.holidays} tone="muted" />
        <Stat label="Weekly offs" value={s.weeklyOffs} tone="muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`${monthName(mp.month)} ${mp.year}`}>
          <MonthCalendar days={days} selected={sp.d} hrefFor={(d) => `?m=${mp.key}&d=${d}`} />
          <div className="mt-4"><StatusLegend /></div>
        </Card>
        <Card title={sel ? formatDate(sel.date) : 'Day details'}>
          {!sel ? <EmptyState icon="☝">Tap a day to see details or fix a missed punch.</EmptyState> : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2"><StatusBadge status={sel.status} detail={sel.detail ?? sel.holidayName ?? sel.leaveTypeCode} />{sel.isLate && <StatusBadge status="LATE" />}</div>
              <p className="tabular">In {formatTimeIST(sel.checkIn)} · Out {formatTimeIST(sel.checkOut)}{sel.hoursWorked !== null ? ` · ${sel.hoursWorked} h` : ''}{sel.source && sel.source !== 'SELF' && sel.source !== 'SEED' ? ` · ${sel.source.toLowerCase().replace('_', ' ')}` : ''}</p>
              {sel.missedPunch && <p className="font-medium text-danger">Missed check-out: this day counts as Absent until a correction is approved.</p>}
              {canRegularise ? (
                <>
                  <h3 className="mt-2 font-semibold">Request a correction</h3>
                  <RegulariseForm date={sel.date} defaultIn={sel.checkIn ? istTimeOf(sel.checkIn).slice(0, 5) : undefined} />
                </>
              ) : sel.date <= today && <p className="text-xs text-muted">Corrections are possible for working days in the last 30 days without a pending request.</p>}
            </div>
          )}
        </Card>
      </div>
      <Card title="My correction requests">
        {regs.length === 0 ? <EmptyState>No correction requests yet.</EmptyState> : (
          <Table head={['Date', 'Requested', 'Reason', 'Status', 'Decided by']}>
            {regs.map((r) => (
              <tr key={r.id}>
                <td className={td}>{formatDate(r.date)}</td>
                <td className={`${td} tabular`}>{formatTimeIST(r.requested_in)}–{formatTimeIST(r.requested_out)}</td>
                <td className={td}>{r.reason}</td>
                <td className={td}><RequestBadge status={r.status} /></td>
                <td className={td}>{r.approver_name ?? '—'}{r.approver_comment ? <span className="block text-xs text-muted">“{r.approver_comment}”</span> : null}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
