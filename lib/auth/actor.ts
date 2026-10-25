import 'server-only';
import '@/lib/db/client'; // registers the postgres.js driver
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveActor, type ActorResult } from '@/lib/services/identity';
import type { Actor } from '@/lib/core/authz';
import { isDevAuth, DEV_COOKIE } from './dev';
import { verifySession } from './password';
import { getLocalSecret } from '@/lib/services/local-auth';

export { isDevAuth };

type Identity = { email: string; clerkUserId: string | null };

async function currentIdentity(): Promise<Identity | null> {
  if (isDevAuth()) {
    // Local sign-in: the cookie is an HMAC-signed, expiring token (lib/auth/password.ts)
    const token = (await cookies()).get(DEV_COOKIE)?.value;
    const email = verifySession(token, await getLocalSecret());
    return email ? { email, clerkUserId: null } : null;
  }
  const { auth, currentUser } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
  return email ? { email, clerkUserId: userId } : null;
}

/** Resolved once per request (React cache). */
export const getActorResult = cache(async (): Promise<ActorResult | null> => {
  const id = await currentIdentity();
  if (!id) return null;
  return resolveActor(id);
});

/**
 * CHECK 2 (ARCHITECTURE §2): every page and server action starts here.
 * Not signed in → sign-in. Unknown or exited employee → access denied.
 */
export async function getActor(): Promise<Actor> {
  const r = await getActorResult();
  if (!r) redirect('/sign-in');
  if (r.status !== 'ok') redirect(`/access-denied?reason=${r.status}`);
  return r.actor;
}

/** For route handlers: returns the actor or a JSON error Response (no redirects in APIs). */
export async function getActorForApi(): Promise<Actor | Response> {
  const r = await getActorResult();
  if (!r) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (r.status !== 'ok') return Response.json({ error: r.status === 'exited' ? 'Account deactivated' : 'No employee record' }, { status: 403 });
  return r.actor;
}
