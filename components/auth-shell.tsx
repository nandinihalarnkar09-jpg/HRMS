import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './brand';

/** Split layout for sign-in pages: blue brand panel + white form panel. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand via-navy-2 to-navy p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-white/5" />
        <Link href="/welcome" className="relative"><Logo size={44} tone="light" /></Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Your attendance, leave and HR records, in one place.</h2>
          <ul className="mt-8 flex flex-col gap-4 text-[15px] text-[#DBEAFE]">
            {['Check in with one tap, in IST', 'See your real leave balance before you apply', 'Managers approve from one inbox', 'Personal data masked and audited'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded-full bg-white/15 text-xs">✓</span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative mt-16 text-xs text-[#93C5FD]">Konkan Coastal Foods · Panaji Head Office & Verna Plant, Goa</p>
      </section>
      <section className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <div className="lg:hidden"><Link href="/welcome"><Logo size={40} /></Link></div>
        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="text-[28px] font-semibold tracking-tight text-navy">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">Need help signing in? Contact HR at the Panaji head office.</p>
      </section>
    </main>
  );
}
