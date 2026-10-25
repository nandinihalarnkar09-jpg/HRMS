import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { isDevAuth } from '@/lib/auth/dev';
import './globals.css';

// Every page depends on the signed-in user, so nothing is prerendered at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Lehar HR', template: '%s · Lehar HR' },
  description: 'HRMS for Konkan Coastal Foods: employee records, attendance and leave',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0F766E' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en-IN">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
  return isDevAuth() ? body : <ClerkProvider>{body}</ClerkProvider>;
}
