import Image from 'next/image';

export function Logo({ size = 36, subtitle = true }: { size?: number; subtitle?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/logo.svg" alt="" width={size} height={size} priority />
      <span className="leading-tight">
        <span className="block font-semibold tracking-tight text-ink">Lehar HR</span>
        {subtitle && <span className="block text-xs text-muted">Konkan Coastal Foods</span>}
      </span>
    </span>
  );
}
