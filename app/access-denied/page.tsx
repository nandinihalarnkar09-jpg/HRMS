import { Logo } from '@/components/brand';
import { Card } from '@/components/ui';
import { SignOutButton } from '@/components/sign-out';

export const metadata = { title: 'Access denied' };

export default async function AccessDenied({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const exited = reason === 'exited';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <Logo size={44} />
      <Card className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{exited ? 'Your access has ended' : 'No employee record'}</h1>
        <p className="mt-2 text-sm text-muted">
          {exited
            ? 'Your last working day has passed, so you can no longer use Lehar HR. Please contact HR if this is a mistake.'
            : 'You are signed in, but your email is not linked to an employee in Lehar HR. Ask HR to add you with this email address.'}
        </p>
        <div className="mt-4 flex justify-center"><SignOutButton /></div>
      </Card>
    </main>
  );
}
