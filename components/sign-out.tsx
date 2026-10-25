import { SignOutButton as ClerkSignOut } from '@clerk/nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';
import { btnClass } from './ui';

async function localSignOut() {
  'use server';
  (await cookies()).delete(DEV_COOKIE);
  redirect('/welcome');
}

export function SignOutButton({ className }: { className?: string }) {
  if (isDevAuth()) {
    return <form action={localSignOut}><button className={className ?? btnClass('secondary', 'sm')}>Sign out</button></form>;
  }
  return <ClerkSignOut redirectUrl="/welcome"><button className={className ?? btnClass('secondary', 'sm')}>Sign out</button></ClerkSignOut>;
}
