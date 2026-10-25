import Link from 'next/link';
import { getActor } from '@/lib/auth/actor';
import { getMyDay, getTeamToday, listMyRegularisations, listPendingRegularisations } from '@/lib/services/attendance';
import { getBalances, listMyRequests, listPendingForApprover } from '@/lib/services/leave';
import { formatDate, formatDateShort, formatTimeIST } from '@/lib/core/dates';
import { CheckInPanel } from '@/components/check-in';
import { Alert, Card, EmptyState, LinkButton, RequestBadge, StatusBadge, fmtDays } from '@/components/ui';

export const metadata = { title: 'Home' };

async function safe<T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false }> {
  try { return { ok: true, v: await p }; } catch (e) { console.error(e); return { ok: false }; }
}

export default async function Home() {
  const actor = await getActor();
  const team = actor.isManager || actor.isHrAdmin;
  const [day, balances, myReqs, myRegs, teamToday, approvals, regApprovals] = await Promise.all([
    safe(getMyDay(actor)), safe(getBalances(actor)), safe(listMyRequests(actor, 20)), safe(listMyRegularisations(actor)),
    team ? safe(getTeamToday(actor)) : Promise.resolve(null),
    team ? safe(listPendingForApprover(actor)) : Promise.resolve(null),
    team ? safe(listPendingRegularisations(actor)) : Promise.resolve(null),
  ]);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pendingLeave = myReqs.ok ? myReqs.v.filter((r) => r.status === 'PENDING') : [];
  const pendingRegs = myRegs.ok ? myRegs.v.filter((r) => r.status === 'PENDING') : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{greet}, {actor.fullName.split(' ')[0]}</h1>
        <p className="text-sm text-muted">{day.ok ? formatDate(day.v.today) : ''} · IST</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* TODAY: check-in without any other click */}
        <Card title={`Today${day.ok ? ` · ${day.v.employee.location_name}` : ''}`}>
          {day.ok ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={day.v.day.status} detail={day.v.day.detail ?? day.v.day.holidayName} />
                {day.v.day.isLate && <StatusBadge status="LATE" />}
              </div>
              <dl className="tabular grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted">Check in</dt><dd className="text-lg font-semibold">{formatTimeIST(day.v.day.checkIn)}</dd></div>
                <div><dt className="text-muted">Check out</dt><dd className="text-lg font-semibold">{formatTimeIST(day.v.day.checkOut)}</dd></div>
              </dl>
              <CheckInPanel checkedIn={Boolean(day.v.day.checkIn)} checkedOut={Boolean(day.v.day.checkOut)} isWfh={day.v.day.status === 'WFH'}
                workingDay={!['HOLIDAY', 'WEEKLY_OFF'].includes(day.v.day.status)} />
            </div>
          ) : <Alert kind="error">Couldn&apos;t load today&apos;s attendance. Refresh to try again.</Alert>}
        </Card>

        {/* LEAVE BALANCE: visible without clicking */}
        <Card title={`Leave balance · ${day.ok ? day.v.today.slice(0, 4) : ''}`} action={<Link href="/leave" className="text-sm font-medium text-brand">Details →</Link>}>
          {balances.ok ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {balances.v.filter((b) => b.available !== null).map((b) => (
                  <div key={b.code} className="rounded-[var(--radius-control)] border border-line p-3">
                    <p className="text-xs font-semibold text-muted">{b.code} <span className="font-normal">· {b.name}</span></p>
                    <p className="tabular mt-1 text-2xl font-semibold">{fmtDays(b.available)}</p>
                    <p className="text-xs text-muted">available{b.pending ? ` · ${fmtDays(b.pending)} pending` : ''}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">Maternity, paternity and loss-of-pay leave are taken on request. <Link className="text-brand underline" href="/leave">See policy limits</Link>.</p>
              <LinkButton href="/leave/apply" className="w-full sm:w-auto">Apply leave</LinkButton>
            </div>
          ) : <Alert kind="error">Couldn&apos;t load your balance.</Alert>}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="My pending requests">
          {pendingLeave.length + pendingRegs.length === 0 ? <EmptyState icon="🎉">No pending requests.</EmptyState> : (
            <ul className="divide-y divide-line text-sm">
              {pendingLeave.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span><b>{r.code}</b> · {formatDateShort(r.from_date)}{r.to_date !== r.from_date ? `–${formatDateShort(r.to_date)}` : ''} · {fmtDays(r.days)} day(s)</span>
                  <RequestBadge status={r.status} />
                </li>
              ))}
              {pendingRegs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>Attendance correction · {formatDateShort(r.date)}</span><RequestBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {team && (
          <Card title="Team today" action={<Link href="/attendance/team" className="text-sm font-medium text-brand">Team view →</Link>}>
            {teamToday?.ok ? (() => {
              const t = teamToday.v;
              const c = (s: string[]) => t.filter((x) => s.includes(x.status)).length;
              const notIn = t.filter((x) => x.status === 'IN_PROGRESS' && !x.checkIn).length;
              const away = t.filter((x) => ['ON_LEAVE', 'ABSENT'].includes(x.status) || (x.status === 'IN_PROGRESS' && !x.checkIn));
              return (
                <div className="flex flex-col gap-3">
                  <div className="tabular flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[#166534]">Present {c(['PRESENT', 'WFH', 'HALF_DAY']) + t.filter((x) => x.status === 'IN_PROGRESS' && x.checkIn).length}</span>
                    <span className="rounded-full bg-[#DBEAFE] px-3 py-1 text-[#1E40AF]">On leave {c(['ON_LEAVE'])}</span>
                    <span className="rounded-full bg-[#FEE2E2] px-3 py-1 text-[#991B1B]">Absent {c(['ABSENT'])}</span>
                    <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-[#475569]">Not yet in {notIn}</span>
                  </div>
                  {away.length === 0 ? <EmptyState icon="✓">Your team is all in.</EmptyState> : (
                    <ul className="divide-y divide-line text-sm">
                      {away.slice(0, 8).map((x) => (
                        <li key={x.id} className="flex items-center justify-between py-1.5"><span>{x.full_name}</span>
                          {x.status === 'IN_PROGRESS' ? <span className="text-xs text-muted">Not checked in yet</span> : <StatusBadge status={x.status} detail={x.leaveTypeCode} />}</li>
                      ))}
                    </ul>
                  )}
                  {((approvals?.ok ? approvals.v.length : 0) + (regApprovals?.ok ? regApprovals.v.length : 0)) > 0 && (
                    <LinkButton href="/approvals" variant="secondary">
                      Review {(approvals?.ok ? approvals.v.length : 0) + (regApprovals?.ok ? regApprovals.v.length : 0)} pending approval(s)
                    </LinkButton>
                  )}
                </div>
              );
            })() : <Alert kind="error">Couldn&apos;t load team attendance.</Alert>}
          </Card>
        )}
      </div>
    </div>
  );
}
