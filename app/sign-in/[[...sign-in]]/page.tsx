import { SignIn } from '@clerk/nextjs';
import '@/lib/db/client';
import { AuthShell } from '@/components/auth-shell';
import { LocalSignInForm } from '@/components/local-sign-in';
import { isDevAuth } from '@/lib/auth/dev';
import { listDemoAccounts } from '@/lib/services/local-auth';

export const metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (isDevAuth()) {
    const demo = await listDemoAccounts();
    return (
      <AuthShell title="Welcome back" subtitle="Sign in with your Konkan Coastal Foods work email.">
        <LocalSignInForm demo={demo} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Welcome back" subtitle="Sign in with your Konkan Coastal Foods work email.">
      <SignIn appearance={{
        variables: { colorPrimary: '#1D4ED8', colorText: '#0F1E3D', borderRadius: '8px', fontFamily: 'Segoe UI, system-ui, sans-serif' },
        elements: { card: 'shadow-none border border-[#DCE6F5]', rootBox: 'w-full', cardBox: 'w-full shadow-none' },
      }} />
      <p className="mt-4 text-xs text-muted">Test accounts: <code>firstname.lastname+clerk_test@example.com</code>, verification code <code>424242</code>.</p>
    </AuthShell>
  );
}
