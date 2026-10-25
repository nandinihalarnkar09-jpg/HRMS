import Link from 'next/link';
import { Logo } from '@/components/brand';
import { btnClass } from '@/components/ui';
import { todayIST } from '@/lib/core/dates';

export const metadata = { title: 'Welcome' };

const FEATURES = [
  { icon: '◷', title: 'Attendance in IST', text: 'One-tap check-in and check-out. Present, Half Day, Late and Weekly Off are worked out automatically for Panaji and Verna.' },
  { icon: '✈', title: 'Leave you can trust', text: 'Live balances for CL, SL and EL. Working days are counted for your location, so a Friday-to-Monday leave costs 2 days, not 4.' },
  { icon: '✓', title: 'One approvals inbox', text: 'Managers see the balance before and after, plus clash warnings, and approve with a comment. Everyone is emailed.' },
  { icon: '☷', title: 'Employee records', text: 'PAN, Aadhaar, UAN and IFSC validated the Indian way. Sensitive numbers are always masked and every change is audited.' },
  { icon: '⇩', title: 'Month-end in one click', text: 'Days present, WFH, leave by type and LOP for every employee, as a CSV ready for the payroll vendor.' },
  { icon: '✦', title: 'Ask HR assistant', text: '“Kal ki chutti chahiye, kitni CL bachi hai?” It checks the system and drafts the request for you to confirm.' },
];

export default function Welcome() {
  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo size={36} />
          <nav className="flex items-center gap-2">
            <a href="#features" className="hidden px-3 text-sm font-medium text-muted hover:text-brand sm:inline">Features</a>
            <a href="#how" className="hidden px-3 text-sm font-medium text-muted hover:text-brand sm:inline">How it works</a>
            <Link href="/sign-in" className={btnClass('primary')}>Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand via-navy-2 to-navy text-white">
        <div aria-hidden className="absolute -right-32 -top-32 size-[30rem] rounded-full bg-white/5" />
        <div aria-hidden className="absolute -bottom-40 left-1/3 size-[26rem] rounded-full bg-white/5" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-[#DBEAFE] ring-1 ring-white/20">HRMS · Konkan Coastal Foods, Goa</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.15] tracking-tight md:text-5xl">HR that just works, for every employee.</h1>
            <p className="mt-5 max-w-lg text-lg text-[#DBEAFE]">Employee records, attendance and leave for the Panaji head office and the Verna plant, all in one simple place, replacing the Excel sheet, the paper register and WhatsApp approvals.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-white px-6 font-semibold text-brand shadow-sm hover:bg-brand-50">Sign in to Lehar HR</Link>
              <a href="#features" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-white/40 px-6 font-medium text-white hover:bg-white/10">See what&apos;s inside</a>
            </div>
          </div>
          {/* Product preview card (illustrative) */}
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-5 text-ink shadow-2xl ring-1 ring-white/30" aria-label="Preview of the Lehar HR dashboard">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-navy">Good morning, Ravi</p>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand">Verna Plant</span>
            </div>
            <div className="mt-4 rounded-xl border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-2">Today</p>
              <div className="mt-2 flex items-end justify-between">
                <div><p className="text-xs text-muted">Check in</p><p className="tabular text-2xl font-semibold">09:02</p></div>
                <span className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 text-sm font-semibold text-white">Check out</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[['CL', '6.5'], ['SL', '7'], ['EL', '11.25']].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line border-t-4 border-t-brand p-3">
                  <p className="text-xs font-semibold text-muted">{k}</p><p className="tabular text-xl font-semibold text-navy">{v}</p><p className="text-[11px] text-muted">available</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm">
              <span className="text-navy-2">CL · 30 Oct – 2 Nov · <b>2 days</b></span>
              <span className="rounded-full border border-dashed border-[#60A5FA] bg-white px-2 py-0.5 text-xs font-semibold text-brand">Pending</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-line bg-brand-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-center md:grid-cols-4">
          {[['180', 'employees'], ['2', 'locations, own calendars'], ['IST', 'everywhere, always'], ['0', 'Excel sheets needed']].map(([n, t]) => (
            <div key={t}><p className="text-3xl font-semibold text-brand">{n}</p><p className="mt-1 text-sm text-muted">{t}</p></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">Features</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-navy">Everything HR, managers and employees need, nothing they don&apos;t.</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[0_1px_3px_rgb(30_58_138/.06)] transition-shadow hover:shadow-md">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-brand text-lg text-white">{f.icon}</span>
              <h3 className="mt-4 text-lg font-semibold text-navy">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-brand-50">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-navy">Three steps, every day.</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ['Check in', 'Open Lehar HR on your phone or computer and tap Check in. Working from home? Tap that instead.'],
              ['Apply in seconds', 'Pick dates and see exactly how many working days it costs before you submit. Short on balance? Convert the rest to LOP.'],
              ['Get a decision', 'Your manager is emailed, approves from the inbox, and your balance updates the moment it is approved.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-[var(--radius-card)] bg-white p-6 ring-1 ring-line">
                <span className="flex size-9 items-center justify-center rounded-full border-2 border-brand text-sm font-semibold text-brand">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-navy">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-gradient-to-r from-brand to-navy-2 p-8 text-white md:flex-row md:items-center md:p-10">
          <div>
            <h2 className="text-2xl font-semibold">Ready to start your day?</h2>
            <p className="mt-1 text-[#DBEAFE]">Sign in with your work email.</p>
          </div>
          <Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-white px-6 font-semibold text-brand hover:bg-brand-50">Sign in</Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-muted sm:flex-row">
          <Logo size={28} subtitle={false} />
          <p>© {todayIST().slice(0, 4)} Konkan Coastal Foods · Panaji & Verna, Goa · All times IST</p>
        </div>
      </footer>
    </div>
  );
}
