import Link from 'next/link';
import { Logo } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={40} />
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">It doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="text-sm font-medium text-brand underline">Go to Home</Link>
    </main>
  );
}
