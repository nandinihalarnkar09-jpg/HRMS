import { Logo } from '@/components/brand';
import { MobileNav, NavLinks, type NavItem } from '@/components/nav';
import { SignOutButton } from '@/components/sign-out';
import { getActor } from '@/lib/auth/actor';
import { roleLabel } from '@/lib/core/authz';

export const dynamic = 'force-dynamic';

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
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-3">
      <div>
        <p className="text-sm font-semibold">{actor.fullName}</p>
        <p className="text-xs text-muted">{actor.employeeCode} · {roleLabel(actor)}</p>
      </div>
      <SignOutButton />
    </div>
  );
  return (
    <div className="min-h-screen md:flex">
      <MobileNav items={items} header={<Logo size={32} subtitle={false} />} footer={userBox} />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-white p-4 md:flex">
        <Logo />
        <NavLinks items={items} />
        <div className="mt-auto">{userBox}</div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
