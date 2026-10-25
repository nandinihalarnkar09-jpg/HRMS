import Image from 'next/image';

/** Logo + wordmark. `tone="light"` for use on the navy sidebar / blue hero. */
export function Logo({ size = 36, subtitle = true, tone = 'dark' }: { size?: number; subtitle?: boolean; tone?: 'dark' | 'light' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/logo.svg" alt="" width={size} height={size} priority className="rounded-[10px] ring-1 ring-white/20" />
      <span className="leading-tight">
        <span className={`block text-[17px] font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-navy'}`}>Lehar HR</span>
        {subtitle && <span className={`block text-xs ${tone === 'light' ? 'text-[#BFDBFE]' : 'text-muted'}`}>Konkan Coastal Foods</span>}
      </span>
    </span>
  );
}
