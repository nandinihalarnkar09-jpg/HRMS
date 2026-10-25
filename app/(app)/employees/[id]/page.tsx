import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { getEmployeeProfile, getStatutoryMasked } from '@/lib/services/employees';
import { listAuditForEmployee } from '@/lib/services/audit';
import { formatDate, formatDateTimeIST } from '@/lib/core/dates';
import { ContactForm, DeactivateForm, MaskedValue } from '@/components/profile-widgets';
import { Alert, Card, EmptyState, LinkButton, PageHeader, Table, cx, td } from '@/components/ui';

export const metadata = { title: 'Profile' };

const TABS = ['personal', 'job', 'statutory', 'bank', 'emergency', 'audit'] as const;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid grid-cols-[10rem_1fr] gap-2 border-b border-line/60 py-2 text-sm last:border-0"><dt className="text-muted">{k}</dt><dd>{v || '—'}</dd></div>;
}

export default async function Profile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; saved?: string }> }) {
  const actor = await getActor();
  const { id } = await params;
  const sp = await searchParams;
  // E3 + URL tampering: own profile or HR only; anything else is a 404
  const p = await getEmployeeProfile(actor, id).catch(() => null);
  if (!p) notFound();
  const isHr = actor.isHrAdmin;
  const self = actor.id === p.id;
  const tabs = TABS.filter((t) => t !== 'audit' || isHr);
  const tab = (tabs as readonly string[]).includes(sp.tab ?? '') ? sp.tab! : 'personal';
  const masked = tab === 'statutory' || tab === 'bank' ? await getStatutoryMasked(actor, id) : null;
  const audit = tab === 'audit' && isHr ? await listAuditForEmployee(actor, id) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={p.full_name}
        subtitle={<>{p.employee_code} · {p.designation} · {p.location_name} · {p.active ? <span className="text-success">Active</span> : <span className="text-danger">Exited {formatDate(p.last_working_day)}</span>}</>}
        actions={isHr ? <LinkButton href={`/employees/${p.id}/edit`} variant="secondary">Edit (HR)</LinkButton> : undefined} />
      {sp.saved && <Alert kind="success">Saved.</Alert>}
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" aria-label="Profile sections">
        {tabs.map((t) => (
          <Link key={t} href={`?tab=${t}`} aria-current={t === tab ? 'page' : undefined}
            className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm capitalize', t === tab ? 'border-brand font-semibold text-brand-strong' : 'border-transparent text-muted hover:text-ink')}>
            {t === 'emergency' ? 'Emergency contact' : t === 'audit' ? 'Audit trail' : t}
          </Link>
        ))}
      </nav>

      {tab === 'personal' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Personal">
            <dl>
              <Row k="Email" v={p.email} /><Row k="Mobile" v={p.mobile} /><Row k="Date of birth" v={formatDate(p.dob)} /><Row k="Gender" v={p.gender} />
              <Row k="Address" v={<>{p.address_line1}{p.address_line2 && <>, {p.address_line2}</>}<br />{p.city}, {p.state} {p.pincode}</>} />
            </dl>
          </Card>
          {(self || isHr) && (
            <Card title="Edit contact details">
              <ContactForm id={p.id} initial={p as unknown as Record<string, string | null>} />
            </Card>
          )}
        </div>
      )}

      {tab === 'job' && (
        <Card title="Job">
          <dl>
            <Row k="Employee code" v={<span className="tabular">{p.employee_code}</span>} /><Row k="Designation" v={p.designation} /><Row k="Department" v={p.department_name} />
            <Row k="Location" v={p.location_name} /><Row k="Reporting manager" v={p.manager_name ? `${p.manager_name} (${p.manager_code})` : 'None'} />
            <Row k="Salary grade" v={p.salary_grade} /><Row k="Date of joining" v={formatDate(p.date_of_joining)} />
            <Row k="Last working day" v={p.last_working_day ? formatDate(p.last_working_day) : '—'} /><Row k="HR Admin" v={p.is_hr_admin ? 'Yes' : 'No'} />
          </dl>
          {!isHr && <p className="mt-3 text-xs text-muted">Job details are maintained by HR. Contact HR to change them.</p>}
          {isHr && !self && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 font-semibold">{p.active ? 'Exit / deactivate' : 'Reactivate'}</h3>
              <DeactivateForm id={p.id} active={!p.last_working_day} minDate={p.date_of_joining} />
            </div>
          )}
        </Card>
      )}

      {tab === 'statutory' && masked && (
        <Card title="Statutory">
          <dl>
            <Row k="PAN" v={<MaskedValue masked={masked.pan} employeeId={p.id} field="pan" canReveal={isHr} />} />
            <Row k="Aadhaar" v={<span className="tabular font-mono">{masked.aadhaar}</span>} />
            <Row k="UAN (PF)" v={<span className="tabular font-mono">{masked.uan}</span>} />
          </dl>
          <p className="mt-3 text-xs text-muted">Aadhaar is never shown in full. {isHr ? 'Every Reveal is written to the audit trail.' : ''}</p>
        </Card>
      )}

      {tab === 'bank' && masked && (
        <Card title="Bank">
          <dl>
            <Row k="Account number" v={<MaskedValue masked={masked.account} employeeId={p.id} field="account_number" canReveal={isHr} />} />
            <Row k="IFSC" v={<span className="font-mono">{masked.ifsc}</span>} /><Row k="Bank" v={masked.bankName} /><Row k="Account holder" v={masked.accountHolder} />
          </dl>
        </Card>
      )}

      {tab === 'emergency' && (
        <Card title="Emergency contact">
          <dl><Row k="Name" v={p.emergency_contact_name} /><Row k="Relation" v={p.emergency_contact_relation} /><Row k="Phone" v={p.emergency_contact_phone} /></dl>
          {(self || isHr) && <p className="mt-3 text-xs text-muted">Edit it on the Personal tab.</p>}
        </Card>
      )}

      {tab === 'audit' && isHr && (
        <Card title="Audit trail">
          {audit.length === 0 ? <EmptyState>No changes recorded yet.</EmptyState> : (
            <Table head={['When (IST)', 'Who', 'Action', 'Field', 'Old', 'New', 'Reason']}>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTimeIST(a.changed_at)}</td>
                  <td className={td}>{a.changed_by_name ?? 'System'}</td>
                  <td className={td}>{a.action}</td>
                  <td className={td}>{a.field ?? '—'}</td>
                  <td className={`${td} font-mono text-xs`}>{a.old_value ?? '—'}</td>
                  <td className={`${td} font-mono text-xs`}>{a.new_value ?? '—'}</td>
                  <td className={td}>{a.reason ?? ''}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
