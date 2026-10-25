/**
 * Reusable components (DESIGN.md §2 "Reusable components"). Server-safe (no hooks).
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { DayStatus } from '@/lib/core/day-status';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- buttons
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BTN: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-sm hover:bg-brand-strong disabled:bg-[#93A8D0]',
  secondary: 'bg-white text-brand border border-[#BFD0EE] hover:bg-brand-50 disabled:text-[#93A8D0]',
  ghost: 'text-brand hover:bg-brand-50 disabled:text-[#93A8D0]',
  danger: 'bg-navy text-white hover:bg-navy-2 disabled:bg-[#93A8D0]',
};
export const btnClass = (v: Variant = 'primary', size: 'md' | 'lg' | 'sm' = 'md') => cx(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors disabled:cursor-not-allowed',
  size === 'lg' ? 'min-h-14 px-6 text-lg' : size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-sm',
  BTN[v],
);

export function Button({ variant = 'primary', size = 'md', className, ...p }: ComponentProps<'button'> & { variant?: Variant; size?: 'md' | 'lg' | 'sm' }) {
  return <button className={cx(btnClass(variant, size), className)} {...p} />;
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: 'md' | 'lg' | 'sm' }) {
  return <Link className={cx(btnClass(variant, size), className)} {...p} />;
}

// ---------------------------------------------------------------- layout
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-[var(--radius-card)] border border-line bg-card p-4 shadow-[0_1px_3px_rgb(30_58_138/.06)] md:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[13px] font-semibold uppercase tracking-wider text-navy-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const c = {
    info: 'border-[#BFDBFE] bg-brand-50 text-navy-2',
    warning: 'border-[#BFDBFE] border-l-4 border-l-brand bg-white text-navy-2',
    error: 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]',
    success: 'border-[#BFDBFE] bg-brand-50 text-navy-2',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-[var(--radius-control)] border px-3 py-2 text-sm', c)}>{children}</div>;
}

export function EmptyState({ icon = '∿', children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-xl text-brand">{icon}</span>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-[#E3EBF8]', className)} />;
}

// ---------------------------------------------------------------- status badges (DESIGN.md §2)
export const STATUS_META: Record<DayStatus | 'LATE', { label: string; code: string; cls: string }> = {
  PRESENT: { label: 'Present', code: 'P', cls: 'bg-[#DBEAFE] text-[#1E3A8A]' },
  WFH: { label: 'Present (WFH)', code: 'WFH', cls: 'bg-[#DBEAFE] text-[#1E3A8A]' },
  HALF_DAY: { label: 'Half Day', code: 'HD', cls: 'bg-[#EFF6FF] text-[#1D4ED8] border border-dashed border-[#60A5FA]' },
  ABSENT: { label: 'Absent', code: 'A', cls: 'bg-[#1E3A8A] text-white' },
  ON_LEAVE: { label: 'On Leave', code: 'L', cls: 'bg-[#2563EB] text-white' },
  HOLIDAY: { label: 'Holiday', code: 'HOL', cls: 'bg-white text-[#1D4ED8] border border-[#1D4ED8]' },
  WEEKLY_OFF: { label: 'Weekly Off', code: 'WO', cls: 'bg-[#F4F7FD] text-[#4A5B7A]' },
  LATE: { label: 'Late', code: 'LATE', cls: 'bg-[#BFDBFE] text-[#172554]' },
  IN_PROGRESS: { label: 'In progress', code: '…', cls: 'bg-white text-[#1D4ED8] border border-[#93C5FD]' },
  UPCOMING: { label: 'Upcoming', code: '', cls: 'bg-white text-[#94A3B8]' },
  NOT_EMPLOYED: { label: '—', code: '', cls: 'bg-white text-[#CBD5E1]' },
};

export function StatusBadge({ status, detail, compact }: { status: DayStatus | 'LATE'; detail?: string | null; compact?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', m.cls)} title={m.label}>
      <span className="tabular">{m.code}</span>
      {!compact && <span className="font-medium">{m.label}{detail ? ` · ${detail}` : ''}</span>}
    </span>
  );
}

const REQ: Record<string, string> = {
  PENDING: 'bg-white text-[#1D4ED8] border border-dashed border-[#60A5FA]',
  APPROVED: 'bg-[#1D4ED8] text-white',
  REJECTED: 'bg-[#172554] text-white',
  CANCELLED: 'bg-[#F4F7FD] text-[#4A5B7A]',
  DRAFT: 'bg-[#F4F7FD] text-[#4A5B7A]',
  CONFIRMED: 'bg-[#1D4ED8] text-white',
  SENT: 'bg-[#1D4ED8] text-white',
  SKIPPED: 'bg-[#F4F7FD] text-[#4A5B7A]',
  FAILED: 'bg-[#FEF2F2] text-[#991B1B]',
};
export function RequestBadge({ status }: { status: string }) {
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', REQ[status] ?? REQ.DRAFT)}>{status === 'SKIPPED' ? 'Logged only' : status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function StatusLegend() {
  const keys: (DayStatus | 'LATE')[] = ['PRESENT', 'WFH', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'LATE'];
  return <div className="flex flex-wrap gap-2">{keys.map((k) => <StatusBadge key={k} status={k} />)}</div>;
}

// ---------------------------------------------------------------- form fields (server-safe)
export function FieldShell({ label, name, error, hint, children, required }: { label: string; name: string; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}</label>
      {children}
      {hint && !error && <p id={`${name}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${name}-error`} className="flex items-start gap-1 text-xs font-medium text-danger"><span aria-hidden>⚠</span>{error}</p>}
    </div>
  );
}

export const inputClass = (error?: string) => cx(
  'min-h-11 w-full rounded-[var(--radius-control)] border bg-white px-3 text-sm text-ink outline-none placeholder:text-[#8A9BBB] focus:border-brand focus:ring-2 focus:ring-brand-soft',
  error ? 'border-danger' : 'border-line',
);

export function Input({ label, name, error, hint, required, className, ...p }: ComponentProps<'input'> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <input id={name} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className={cx(inputClass(error), className)} {...p} />
    </FieldShell>
  );
}

export function Select({ label, name, error, hint, required, options, placeholder, ...p }: ComponentProps<'select'> & { label: string; name: string; error?: string; hint?: ReactNode; options: { value: string | number; label: string }[]; placeholder?: string }) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <select id={name} name={name} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} className={inputClass(error)} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function Textarea({ label, name, error, hint, required, ...p }: ComponentProps<'textarea'> & { label: string; name: string; error?: string; hint?: ReactNode }) {
  return (
    <FieldShell label={label} name={name} error={error} hint={hint} required={required}>
      <textarea id={name} name={name} required={required} aria-invalid={Boolean(error)} className={cx(inputClass(error), 'min-h-20 py-2')} {...p} />
    </FieldShell>
  );
}

// ---------------------------------------------------------------- tables
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto md:mx-0">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-navy-2">
            {head.map((h, i) => <th key={i} scope="col" className="sticky top-0 bg-brand-50 px-3 py-2.5 font-semibold first:rounded-tl-lg last:rounded-tr-lg">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&>tr:hover]:bg-brand-50/60 [&>tr]:border-b [&>tr]:border-line/70">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}
export const td = 'px-3 py-2 align-top';

export function fmtDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'muted' }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line border-t-4 border-t-brand bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx('tabular mt-1 text-2xl font-semibold', tone === 'muted' ? 'text-muted' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
