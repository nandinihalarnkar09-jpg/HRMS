import Link from 'next/link';
import { getActor } from '@/lib/auth/actor';
import { getBalances, listMyRequests } from '@/lib/services/leave';
import { formatDate, todayIST } from '@/lib/core/dates';
import { CancelLeaveButton } from '@/components/request-actions';
import { Alert, Card, EmptyState, LinkButton, PageHeader, RequestBadge, Table, fmtDays, td } from '@/components/ui';

export const metadata = { title: 'My leave' };

export default async function MyLeave({ searchParams }: { searchParams: Promise<{ applied?: string }> }) {
  const actor = await getActor();
  const { applied } = await searchParams;
  const [balances, reqs] = await Promise.all([getBalances(actor), listMyRequests(actor)]);
  const year = todayIST().slice(0, 4);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="My leave" subtitle={`Leave year ${year} (Jan–Dec)`} actions={<LinkButton href="/leave/apply">Apply leave</LinkButton>} />
      {applied && <Alert kind="success">Request submitted. Your manager has been emailed. Your balance changes only once it is approved.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.code} title={`${b.code} · ${b.name}`}>
            {b.available !== null ? (
              <>
                <p className="tabular text-3xl font-semibold">{fmtDays(b.available)} <span className="text-sm font-normal text-muted">available</span></p>
                <dl className="tabular mt-3 grid grid-cols-5 gap-1 text-center text-xs">
                  {[['Opening', b.opening], ['Accrued', b.accrued], ['Adjust', b.adjustment], ['Used', b.used], ['Pending', b.pending]].map(([k, v]) => (
                    <div key={k as string} className="rounded bg-slate-50 py-1"><dt className="text-muted">{k}</dt><dd className="font-semibold">{fmtDays(v as number)}</dd></div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-muted">Available = opening + accrued + adjustment − used. You can still apply for {fmtDays(b.canApply)}.</p>
              </>
            ) : b.unlimited ? (
              <p className="text-sm text-muted">Unlimited, unpaid. Used this year: <b className="tabular text-ink">{fmtDays(b.used)}</b></p>
            ) : (
              <p className="text-sm text-muted">On request: up to <b className="text-ink">{b.perEvent}</b> days per event. Used this year: <b className="tabular text-ink">{fmtDays(b.used)}</b></p>
            )}
          </Card>
        ))}
      </div>
      <Card title="Request history">
        {reqs.length === 0 ? <EmptyState action={<Link href="/leave/apply" className="text-brand underline">Apply for leave</Link>}>No leave requests yet.</EmptyState> : (
          <Table head={['Type', 'Dates', 'Days', 'Reason', 'Status', 'Decision', '']}>
            {reqs.map((r) => (
              <tr key={r.id}>
                <td className={`${td} font-semibold`}>{r.code}</td>
                <td className={td}>{formatDate(r.from_date)}{r.to_date !== r.from_date && <> –<br />{formatDate(r.to_date)}</>}{r.is_half_day && <span className="block text-xs text-muted">Half day</span>}</td>
                <td className={`${td} tabular`}>{fmtDays(r.days)}{r.lop_days > 0 && <span className="block text-xs text-muted">{fmtDays(r.paid_days)} paid + {fmtDays(r.lop_days)} LOP</span>}</td>
                <td className={td}>{r.reason}{r.has_attachment && <a className="block text-xs text-brand underline" href={`/api/leave/attachment/${r.id}`} target="_blank" rel="noreferrer">Certificate</a>}</td>
                <td className={td}><RequestBadge status={r.status} /></td>
                <td className={td}>{r.approver_name ?? '—'}{r.approver_comment && <span className="block text-xs text-muted">“{r.approver_comment}”</span>}</td>
                <td className={td}>{r.can_cancel && <CancelLeaveButton id={r.id} />}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
