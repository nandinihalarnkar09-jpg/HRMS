import Link from 'next/link';
import type { DayView } from '@/lib/services/day-results';
import { dayOf, formatTimeIST, weekdayOf } from '@/lib/core/dates';
import { STATUS_META, cx } from './ui';

/** A4: month view, each day colour-coded with the shared status colours and a text code. */
export function MonthCalendar({ days, hrefFor, selected }: { days: DayView[]; hrefFor?: (date: string) => string; selected?: string }) {
  const lead = (weekdayOf(days[0].date) + 6) % 7; // Monday-first grid
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => <div key={`e${i}`} />)}
        {days.map((d) => {
          const m = STATUS_META[d.status];
          const body = (
            <>
              <span className="tabular text-xs font-semibold">{dayOf(d.date)}</span>
              {m.code && <span className="tabular text-[11px] font-bold sm:text-xs">{m.code}</span>}
              {d.isLate && <span className="rounded bg-[#172554] px-1 text-[9px] font-bold text-white">LATE</span>}
              {d.missedPunch && <span className="text-[9px] font-bold underline">missed</span>}
              {d.checkIn && <span className="tabular hidden text-[10px] opacity-80 sm:block">{formatTimeIST(d.checkIn)}–{formatTimeIST(d.checkOut)}</span>}
            </>
          );
          const cls = cx('flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-md p-1 sm:min-h-20', m.cls,
            selected === d.date && 'ring-2 ring-offset-1 ring-brand', d.status === 'UPCOMING' && 'border border-line');
          const title = `${d.date}: ${m.label}${d.detail ? ` (${d.detail})` : ''}${d.holidayName ? ` – ${d.holidayName}` : ''}`;
          return hrefFor && d.status !== 'NOT_EMPLOYED'
            ? <Link key={d.date} href={hrefFor(d.date)} className={cls} title={title} aria-label={title}>{body}</Link>
            : <div key={d.date} className={cls} title={title}>{body}</div>;
        })}
      </div>
    </div>
  );
}
