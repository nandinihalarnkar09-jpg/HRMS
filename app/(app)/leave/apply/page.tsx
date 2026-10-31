import { getActor } from '@/lib/auth/actor';
import { applicableLeaveTypes } from '@/lib/services/leave';
import { todayIST } from '@/lib/core/dates';
import { earliestLeaveDate, isHalfDaySession } from '@/lib/core/leave-rules';
import { ApplyLeaveForm } from '@/components/apply-leave-form';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Apply leave' };

export default async function ApplyLeave({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string; reason?: string; half?: string; session?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const types = await applicableLeaveTypes(actor);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="Apply leave" subtitle="Working days are counted for your location; weekly offs and holidays are excluded." />
      <Card>
        <ApplyLeaveForm types={types} minDate={earliestLeaveDate(todayIST())} today={todayIST()}
          initial={{ type: sp.type?.toUpperCase(), from: sp.from, to: sp.to, reason: sp.reason, halfDay: sp.half === '1', session: isHalfDaySession(sp.session) ? sp.session : undefined }} />
      </Card>
    </div>
  );
}
