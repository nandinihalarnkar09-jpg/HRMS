import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import '@/lib/db/client';
import { Logo } from '@/components/brand';
import { Alert, Card } from '@/components/ui';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';
import { listLoginDirectory } from '@/lib/services/identity';

export const metadata = { title: 'Developer login' };
export const dynamic = 'force-dynamic';

async function devSignIn(formData: FormData) {
  'use server';
  if (!isDevAuth()) notFound();
  const email = String(formData.get('email') ?? '');
  (await cookies()).set(DEV_COOKIE, email, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/');
}

export default async function DevLogin() {
  if (!isDevAuth()) notFound(); // invisible in production
  const users = await listLoginDirectory();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-10">
      <Logo size={44} />
      <Alert kind="warning">Local development login (AUTH_MODE=dev). It is switched off automatically in production, where Clerk is used.</Alert>
      <Card title="Sign in as a seeded user">
        <form action={devSignIn} className="grid gap-2 sm:grid-cols-2">
          {users.map((u) => (
            <button key={u.email} name="email" value={u.email}
              className="flex flex-col items-start rounded-[var(--radius-control)] border border-line bg-white px-3 py-2 text-left hover:border-brand hover:bg-brand-soft/40">
              <span className="font-medium">{u.full_name} <span className="text-xs text-muted">· {u.employee_code}</span></span>
              <span className="text-xs text-muted">{u.role} · {u.designation} · {u.location}</span>
            </button>
          ))}
        </form>
      </Card>
    </main>
  );
}
