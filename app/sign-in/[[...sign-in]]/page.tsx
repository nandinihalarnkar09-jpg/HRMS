import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand';
import { isDevAuth } from '@/lib/auth/dev';

export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  if (isDevAuth()) redirect('/dev-login');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo size={44} />
      <SignIn />
      <p className="max-w-sm text-center text-xs text-muted">
        Test accounts use <code>firstname.lastname+clerk_test@example.com</code> with verification code <code>424242</code> (see README).
      </p>
    </main>
  );
}
