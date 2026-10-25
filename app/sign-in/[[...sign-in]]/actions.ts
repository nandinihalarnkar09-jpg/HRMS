'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import '@/lib/db/client';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';
import { signSession } from '@/lib/auth/password';
import { getLocalSecret, verifyLocalLogin } from '@/lib/services/local-auth';
import { resolveActor } from '@/lib/services/identity';

export type SignInState = { error?: string; email?: string };

/** Local (offline) email + password sign-in. Disabled automatically in production. */
export async function localSignIn(_: SignInState, fd: FormData): Promise<SignInState> {
  if (!isDevAuth()) return { error: 'Use the main sign-in.' };
  const email = String(fd.get('email') ?? '').trim();
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your work email and password.', email };
  const ok = await verifyLocalLogin(email, password);
  if (!ok) return { error: 'That email and password do not match.', email };
  const r = await resolveActor({ email: ok });
  if (r.status === 'exited') return { error: 'Your last working day has passed, so this account can no longer sign in. Contact HR if this is a mistake.', email };
  if (r.status === 'no-record') return { error: 'No employee record for this email.', email };
  (await cookies()).set(DEV_COOKIE, signSession(ok, await getLocalSecret()), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  redirect('/');
}
