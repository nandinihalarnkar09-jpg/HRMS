import { AuthShell } from '@/components/auth-shell';
import { SignOutButton } from '@/components/sign-out';
import { btnClass } from '@/components/ui';

export const metadata = { title: 'Access denied' };

export default async function AccessDenied({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const exited = reason === 'exited';
  return (
    <AuthShell title={exited ? 'Your access has ended' : 'No employee record'}
      subtitle={exited
        ? 'Your last working day has passed, so you can no longer use Lehar HR. Please contact HR if this is a mistake.'
        : 'You are signed in, but your email is not linked to an employee in Lehar HR. Ask HR to add you with this email address.'}>
      <SignOutButton className={btnClass('primary', 'lg') + ' w-full'} />
    </AuthShell>
  );
}
