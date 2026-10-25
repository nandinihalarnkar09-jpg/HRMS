'use client';
import { useActionState, useState } from 'react';
import { localSignIn, type SignInState } from '@/app/sign-in/[[...sign-in]]/actions';
import type { DemoAccount } from '@/lib/services/local-auth';
import { Alert, Button, cx, inputClass } from './ui';

export function LocalSignInForm({ demo }: { demo: DemoAccount[] }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(localSignIn, {});
  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const featured = demo.filter((d) => ['HR Admin', 'Manager'].includes(d.role)).slice(0, 4)
    .concat(demo.filter((d) => d.role === 'Employee').slice(0, 2));

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-navy">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="name@konkanfoods.in" className={inputClass()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-navy">Password</label>
            <button type="button" onClick={() => setShow(!show)} className="text-xs font-medium text-brand hover:underline">{show ? 'Hide' : 'Show'}</button>
          </div>
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={inputClass(state.error)} />
        </div>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        <Button size="lg" disabled={pending} className="w-full">{pending ? 'Signing in…' : 'Sign in'}</Button>
      </form>

      {demo.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line bg-brand-50 p-4">
          <p className="text-sm font-semibold text-navy">Demo accounts</p>
          <p className="mt-0.5 text-xs text-muted">Every employee&apos;s password is <b className="font-mono text-navy">firstname@KCF2026</b>. Tap one to fill the form.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {featured.map((d) => (
              <li key={d.email}>
                <button type="button" onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className={cx('w-full rounded-[var(--radius-control)] border bg-white px-3 py-2 text-left transition-colors hover:border-brand',
                    email === d.email ? 'border-brand ring-2 ring-brand-soft' : 'border-line')}>
                  <span className="block text-sm font-medium text-navy">{d.name}</span>
                  <span className="block text-xs text-muted">{d.role} · {d.location}</span>
                </button>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-brand">All {demo.length} accounts</summary>
            <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-md bg-white">
              {demo.map((d) => (
                <li key={d.email} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0"><span className="block truncate font-medium text-navy">{d.name} <span className="font-normal text-muted">· {d.role}</span></span>
                    <span className="block truncate font-mono">{d.email}</span></span>
                  <button type="button" onClick={() => { setEmail(d.email); setPassword(d.password); }} className="shrink-0 rounded border border-line px-2 py-1 font-medium text-brand hover:bg-brand-50">Use</button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
