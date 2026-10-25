import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { listPendingForApprover } from '@/lib/services/leave';
import { listPendingRegularisations } from '@/lib/services/attendance';
import { formatDate, formatDateShort, formatTimeIST } from '@/lib/core/dates';
import { DecisionForm } from '@/components/request-actions';
import { Card, EmptyState, PageHeader, fmtDays } from '@/components/ui';

export const metadata = { title: 'Approvals' };

export default async function Approvals() {
  const actor = await getActor();
  if (!actor.isManager && !actor.isHrAdmin) notFound();
  const [leave, regs] = await Promise.all([listPendingForApprover(actor), listPendingRegularisations(actor)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Approvals" subtitle={actor.isHrAdmin ? 'All pending requests (except your own)' : 'Pending requests from your direct reports'} />
      <Card title={`Leave (${leave.length})`}>
        {leave.length === 0 ? <EmptyState>Nothing waiting for you. New requests will appear here.</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {leave.map((r) => (
              <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="flex flex-col gap-1 text-sm">
                  <p className="text-base font-semibold">{r.full_name} <span className="text-xs font-normal text-muted">{r.employee_code}</span></p>
                  <p><b>{r.code}</b> · {formatDate(r.from_date)}{r.to_date !== r.from_date && ` – ${formatDate(r.to_date)}`}{r.is_half_day && ' (half day)'} · <b className="tabular">{fmtDays(r.days)}</b> day(s)
                    {r.lop_days > 0 && <span className="text-muted"> ({fmtDays(r.paid_days)} paid + {fmtDays(r.lop_days)} LOP)</span>}</p>
                  <p className="text-muted">“{r.reason}”{r.has_attachment && <> · <a className="text-brand underline" href={`/api/leave/attachment/${r.id}`} target="_blank" rel="noreferrer">View certificate</a></>}</p>
                  {r.available !== null && (
                    <p className="tabular">Balance: {fmtDays(r.available)} {r.code} available → {fmtDays(Math.round((r.available - r.paid_days) * 100) / 100)} after approval</p>
                  )}
                  {r.clashes.length > 0 && (
                    <p className="font-medium text-[#9A3412]">⚠ Clash: {r.clashes.map((c) => `${c.name} (${formatDateShort(c.from)}${c.to !== c.from ? `–${formatDateShort(c.to)}` : ''}, ${c.status.toLowerCase()})`).join('; ')}</p>
                  )}
                </div>
                <DecisionForm id={r.id} kind="leave" />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Attendance corrections (${regs.length})`}>
        {regs.length === 0 ? <EmptyState>No corrections waiting.</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {regs.map((g) => (
              <li key={g.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="flex flex-col gap-1 text-sm">
                  <p className="text-base font-semibold">{g.full_name} <span className="text-xs font-normal text-muted">{g.employee_code}</span></p>
                  <p>{formatDate(g.date)} · recorded <span className="tabular">{formatTimeIST(g.current_in)}–{formatTimeIST(g.current_out)}</span> → requested <b className="tabular">{formatTimeIST(g.requested_in)}–{formatTimeIST(g.requested_out)}</b></p>
                  <p className="text-muted">“{g.reason}”{g.requested_by !== g.employee_id && ` · raised by ${g.requested_by_name}`}</p>
                </div>
                <DecisionForm id={g.id} kind="regularisation" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
