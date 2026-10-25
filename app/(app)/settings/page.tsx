import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import * as s from '@/lib/services/settings';
import { formatDate, formatDateTimeIST, todayIST, yearOf } from '@/lib/core/dates';
import { ActionForm } from '@/components/settings-forms';
import { Card, EmptyState, PageHeader, RequestBadge, Table, cx, inputClass, td } from '@/components/ui';
import {
  addDepartmentAction, addHolidayAction, addLocationAction, carryForwardAction, deleteHolidayAction,
  updateLeaveTypeAction, updatePolicyAction, weeklyOffsAction,
} from './actions';

export const metadata = { title: 'Settings' };

const TABS = [['holidays', 'Holidays'], ['leave-types', 'Leave types'], ['locations', 'Locations & departments'], ['policy', 'Policy text'], ['year-end', 'Year-end'], ['logs', 'Email & agent log']] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const actor = await getActor();
  if (!actor.isHrAdmin) notFound(); // HR only
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'holidays';
  const year = Number(sp.year) || yearOf(todayIST());
  const locations = await s.listLocations();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle="HR Admin only. Every change is audited." />
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} aria-current={k === tab ? 'page' : undefined}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm', k === tab ? 'border-brand font-semibold text-brand-strong' : 'border-transparent text-muted')}>{label}</Link>
        ))}
      </nav>

      {tab === 'holidays' && <Holidays year={year} locations={locations} actor={actor} />}
      {tab === 'leave-types' && <LeaveTypes />}
      {tab === 'locations' && <Locations locations={locations} />}
      {tab === 'policy' && <Policy />}
      {tab === 'year-end' && (
        <Card title="Year-end carry forward">
          <p className="mb-3 text-sm text-muted">Sets next year&apos;s opening balances: EL = min(closing balance, carry-forward limit, 30 days); CL and SL lapse. Safe to run again (it overwrites the openings).</p>
          <ActionForm action={carryForwardAction} submit="Run carry forward" confirmText="Set opening balances for next year?">
            <label className="flex max-w-xs flex-col gap-1 text-sm">Close leave year
              <input name="year" type="number" defaultValue={year} className={inputClass()} />
            </label>
          </ActionForm>
        </Card>
      )}
      {tab === 'logs' && <Logs actor={actor} />}
    </div>
  );
}

async function Holidays({ year, locations, actor }: { year: number; locations: s.LocationRow[]; actor: Awaited<ReturnType<typeof getActor>> }) {
  const hols = await s.listHolidays(actor, { year, locationId: 'all' });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={`Holidays ${year}`} action={<div className="flex gap-2 text-sm"><Link href={`?tab=holidays&year=${year - 1}`} className="text-brand">← {year - 1}</Link><Link href={`?tab=holidays&year=${year + 1}`} className="text-brand">{year + 1} →</Link></div>}>
        {hols.length === 0 ? <EmptyState>No holidays for {year} yet.</EmptyState> : (
          <Table head={['Date', 'Holiday', 'Type', 'Location', '']}>
            {hols.map((h) => (
              <tr key={h.id}>
                <td className={`${td} whitespace-nowrap`}>{formatDate(h.date)}</td>
                <td className={td}>{h.name}</td>
                <td className={td}><span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', h.type === 'OPTIONAL' ? 'bg-[#F4F7FD] text-muted' : h.type === 'NATIONAL' ? 'bg-[#1D4ED8] text-white' : 'bg-[#DBEAFE] text-[#1E3A8A]')}>{h.type.charAt(0) + h.type.slice(1).toLowerCase()}</span></td>
                <td className={td}>{h.location_name}</td>
                <td className={td}><ActionForm action={deleteHolidayAction} submit="Remove" variant="ghost" className="flex" confirmText={`Remove ${h.name} for ${h.location_name}?`}><input type="hidden" name="id" value={h.id} /></ActionForm></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Add holiday">
        <ActionForm action={addHolidayAction} submit="Add holiday">
          <label className="flex flex-col gap-1 text-sm">Date<input name="date" type="date" required className={inputClass()} /></label>
          <label className="flex flex-col gap-1 text-sm">Name<input name="name" required className={inputClass()} placeholder="e.g. Ganesh Chaturthi" /></label>
          <label className="flex flex-col gap-1 text-sm">Type
            <select name="type" className={inputClass()}><option value="NATIONAL">National</option><option value="STATE">State</option><option value="OPTIONAL">Optional (working day, shown only)</option></select>
          </label>
          <fieldset className="flex flex-col gap-1 text-sm"><legend className="mb-1">Locations</legend>
            {locations.map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" name="locationIds" value={l.id} defaultChecked className="size-4" />{l.name}</label>)}
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}

async function LeaveTypes() {
  const types = await s.listLeaveTypes();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {types.map((t) => (
        <Card key={t.id} title={`${t.code} · ${t.name}`}>
          <ActionForm action={updateLeaveTypeAction} submit="Save">
            <input type="hidden" name="id" value={t.id} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="col-span-2 flex flex-col gap-1">Name<input name="name" defaultValue={t.name} className={inputClass()} /></label>
              <label className="flex flex-col gap-1">Annual quota<input name="annualQuota" type="number" step="0.5" defaultValue={t.annualQuota ?? ''} placeholder="none" className={inputClass()} /></label>
              <label className="flex flex-col gap-1">Accrual
                <select name="accrualMethod" defaultValue={t.accrualMethod} className={inputClass()}>
                  <option value="YEAR_START_PRORATED">1 Jan, pro-rated</option><option value="MONTHLY">Monthly</option><option value="ON_REQUEST">On request</option><option value="NONE">None (LOP)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">Monthly rate<input name="monthlyRate" type="number" step="0.01" defaultValue={t.monthlyRate ?? ''} className={inputClass()} /></label>
              <label className="flex flex-col gap-1">Carry-forward max<input name="carryForwardMax" type="number" step="0.5" defaultValue={t.carryForwardMax} className={inputClass()} /></label>
              <label className="flex flex-col gap-1">Certificate if days &gt;<input name="certRequiredAfterDays" type="number" step="0.5" defaultValue={t.certRequiredAfterDays ?? ''} className={inputClass()} /></label>
              <label className="flex flex-col gap-1">Days per event<input name="perEventDays" type="number" defaultValue={t.perEventDays ?? ''} className={inputClass()} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" name="halfDayAllowed" defaultChecked={t.halfDayAllowed} className="size-4" />Half day allowed</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={t.isActive} className="size-4" />Active</label>
            </div>
            <p className="text-xs text-muted">{t.countsCalendarDays ? 'Counted in calendar days. ' : ''}{t.eligibleGender ? `Only for ${t.eligibleGender.toLowerCase()} employees.` : ''}</p>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}

async function Locations({ locations }: { locations: s.LocationRow[] }) {
  const depts = await s.listDepartments();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Locations and weekly offs">
        <div className="flex flex-col gap-5">
          {locations.map((l) => (
            <ActionForm key={l.id} action={weeklyOffsAction} submit="Save weekly offs">
              <input type="hidden" name="id" value={l.id} />
              <p className="font-medium">{l.name} <span className="text-xs text-muted">({l.code}, {l.city})</span></p>
              <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="sr-only">Weekly offs</legend>
                {DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name="days" value={i} defaultChecked={l.weekly_off_days.includes(i)} className="size-4" />{d}</label>)}
              </fieldset>
            </ActionForm>
          ))}
          <details className="rounded border border-line p-3 text-sm"><summary className="cursor-pointer font-medium">Add location</summary>
            <ActionForm action={addLocationAction} submit="Add location">
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input name="code" placeholder="Code (3 letters)" maxLength={3} className={inputClass()} required />
                <input name="name" placeholder="Name" className={inputClass()} required />
                <input name="city" placeholder="City" className={inputClass()} required />
                <input name="state" placeholder="State" defaultValue="Goa" className={inputClass()} />
              </div>
              <fieldset className="flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name="days" value={i} defaultChecked={i === 0} className="size-4" />{d}</label>)}</fieldset>
            </ActionForm>
          </details>
        </div>
      </Card>
      <Card title="Departments">
        <ul className="mb-4 divide-y divide-line text-sm">{depts.map((d) => <li key={d.id} className="flex justify-between py-2"><span>{d.name}</span><span className="tabular text-muted">{d.headcount} people</span></li>)}</ul>
        <ActionForm action={addDepartmentAction} submit="Add department" className="flex flex-wrap items-end gap-2">
          <input name="name" placeholder="New department" className={cx(inputClass(), 'max-w-xs')} required />
        </ActionForm>
      </Card>
    </div>
  );
}

async function Policy() {
  const docs = await s.listPolicyDocs();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">The Ask HR assistant answers policy questions <b>only</b> from this text. If something isn&apos;t written here, it says it doesn&apos;t know.</p>
      {docs.map((d) => (
        <Card key={d.id} title={d.title}>
          <ActionForm action={updatePolicyAction} submit="Save policy text">
            <input type="hidden" name="id" value={d.id} />
            <textarea name="body" defaultValue={d.body} rows={18} className={cx(inputClass(), 'py-2 font-mono text-xs')} />
            <p className="text-xs text-muted">Last updated {formatDateTimeIST(d.updated_at)}. Use “## Heading” and “- bullet” lines.</p>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}

async function Logs({ actor }: { actor: Awaited<ReturnType<typeof getActor>> }) {
  const [emails, agent] = await Promise.all([s.listEmailLog(actor), s.listAgentLog(actor)]);
  return (
    <div className="flex flex-col gap-5">
      <Card title="Email log (last 50)">
        {emails.length === 0 ? <EmptyState>No emails yet.</EmptyState> : (
          <Table head={['When', 'To', 'Subject', 'Status']}>
            {emails.map((e) => (
              <tr key={e.id}><td className={`${td} whitespace-nowrap`}>{formatDateTimeIST(e.created_at)}</td><td className={td}>{e.to_email}</td><td className={td}>{e.subject}</td>
                <td className={td}><RequestBadge status={e.status} />{e.error && e.status === 'FAILED' && <span className="block text-xs text-muted">{e.error.slice(0, 80)}</span>}</td></tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Agent log (every tool call, last 100)">
        {agent.length === 0 ? <EmptyState>No assistant activity yet.</EmptyState> : (
          <Table head={['When', 'User', 'Tool', 'Inputs', 'OK']}>
            {agent.map((a) => (
              <tr key={a.id}><td className={`${td} whitespace-nowrap`}>{formatDateTimeIST(a.created_at)}</td><td className={td}>{a.full_name}</td><td className={`${td} font-mono text-xs`}>{a.tool}</td>
                <td className={`${td} max-w-xs truncate font-mono text-xs`} title={JSON.stringify(a.inputs)}>{JSON.stringify(a.inputs)}</td><td className={td}>{a.ok ? '✓' : '✗'}</td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
