'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { cx } from './ui';

export type NavItem = { href: string; label: string; icon: string; section?: string };

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

/** Sidebar links, styled for the navy sidebar (white text, active = white pill). */
export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  let lastSection: string | undefined;
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((it) => {
        const header = it.section && it.section !== lastSection ? it.section : null;
        lastSection = it.section;
        const active = isActive(path, it.href) && !items.some((o) => o.href !== it.href && o.href.startsWith(it.href + '/') && isActive(path, o.href));
        return (
          <div key={it.href}>
            {header && <p className="mt-5 mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">{header}</p>}
            <Link href={it.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={cx('flex min-h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors',
                active ? 'bg-white font-semibold text-brand shadow-sm' : 'text-[#DBEAFE] hover:bg-white/10 hover:text-white')}>
              <span aria-hidden className={cx('flex size-6 items-center justify-center rounded-md text-[13px]', active ? 'bg-brand-50' : 'bg-white/10')}>{it.icon}</span>
              {it.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items, header, footer }: { items: NavItem[]; header: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-2.5 shadow-md">
        {header}
        <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
          className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-white/20 text-xl text-white">☰</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
          <div className="relative ml-auto flex h-full w-72 max-w-[85%] flex-col gap-4 overflow-y-auto bg-gradient-to-b from-navy to-navy-2 p-4">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="self-end text-2xl leading-none text-white">×</button>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
            <div className="mt-auto">{footer}</div>
          </div>
        </div>
      )}
    </div>
  );
}
