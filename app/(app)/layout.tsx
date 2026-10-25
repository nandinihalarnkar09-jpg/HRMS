import { Logo } from '@/components/brand';
import { MobileNav, NavLinks, type NavItem } from '@/components/nav';
import { SignOutButton } from '@/components/sign-out';
import { getActor } from '@/lib/auth/actor';
import { roleLabel } from '@/lib/core/authz';
import { formatDate, todayIST } from '@/lib/core/dates';

export const dynamic = 'force-dynamic';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor(); // CHECK 2: signed in, linked, active
  const team = actor.isManager || actor.isHrAdmin;
  // Menu items are cosmetic; every page and service re-checks the role on the server.
  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: '⌂' },
    { href: `/employees/${actor.id}`, label: 'My profile', icon: '☺' },
    { href: '/attendance', label: 'My attendance', icon: '◷' },
    { href: '/leave', label: 'My leave', icon: '✈' },
    { href: '/leave/apply', label: 'Apply leave', icon: '+' },
    { href: '/assistant', label: 'Ask HR', icon: '✦' },
    ...(team ? [
      { href: '/attendance/team', label: 'Team attendance', icon: '◫', section: 'Team' },
      { href: '/approvals', label: 'Approvals', icon: '✓', section: 'Team' },
      { href: '/leave/calendar', label: 'Leave calendar', icon: '▦', section: 'Team' },
      { href: '/reports', label: 'Reports', icon: '⇩', section: 'Team' },
    ] : []),
    ...(actor.isHrAdmin ? [
      { href: '/employees', label: 'Employees', icon: '☷', section: 'HR' },
      { href: '/settings', label: 'Settings', icon: '⚙', section: 'HR' },
    ] : []),
  ];
  const userBox = (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-white/10 p-3 ring-1 ring-white/15">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand">{initials(actor.fullName)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{actor.fullName}</p>
          <p className="text-xs text-[#BFDBFE]">{actor.employeeCode} · {roleLabel(actor)}</p>
        </div>
      </div>
      <SignOutButton className="min-h-9 rounded-[var(--radius-control)] border border-white/30 px-3 text-sm font-medium text-white hover:bg-white/10" />
    </div>
  );
  return (
    <div className="min-h-screen md:flex">
      <MobileNav items={items} header={<Logo size={32} subtitle={false} tone="light" />} footer={userBox} />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto bg-gradient-to-b from-navy to-navy-2 p-4 md:flex">
        <div className="px-1 pt-1"><Logo tone="light" /></div>
        <NavLinks items={items} />
        <div className="mt-auto">{userBox}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-line bg-white/95 px-8 backdrop-blur md:flex">
          <p className="text-sm text-muted"><span className="font-semibold text-navy">Konkan Coastal Foods</span> · Human Resources</p>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand">{formatDate(todayIST())} · IST</span>
            <span className="flex items-center gap-2 text-navy">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{initials(actor.fullName)}</span>
              <span className="font-medium">{actor.fullName.split(' ')[0]}</span>
            </span>
          </div>
        </header>
        <main className="px-4 py-5 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
