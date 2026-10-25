import { SignOutButton as ClerkSignOut } from '@clerk/nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';
import { btnClass } from './ui';

async function devSignOut() {
  'use server';
  (await cookies()).delete(DEV_COOKIE);
  redirect('/dev-login');
}

export function SignOutButton({ className }: { className?: string }) {
  if (isDevAuth()) {
    return <form action={devSignOut}><button className={className ?? btnClass('secondary', 'sm')}>Sign out</button></form>;
  }
  return <ClerkSignOut redirectUrl="/sign-in"><button className={className ?? btnClass('secondary', 'sm')}>Sign out</button></ClerkSignOut>;
}
