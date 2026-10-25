import { getActor } from '@/lib/auth/actor';
import { applicableLeaveTypes } from '@/lib/services/leave';
import { addDays, todayIST } from '@/lib/core/dates';
import { MAX_BACKDATE_DAYS } from '@/lib/core/leave-rules';
import { ApplyLeaveForm } from '@/components/apply-leave-form';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Apply leave' };

export default async function ApplyLeave({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string; reason?: string; half?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const types = await applicableLeaveTypes(actor);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title="Apply leave" subtitle="Working days are counted for your location; weekly offs and holidays are excluded." />
      <Card>
        <ApplyLeaveForm types={types} minDate={addDays(todayIST(), -MAX_BACKDATE_DAYS)}
          initial={{ type: sp.type?.toUpperCase(), from: sp.from, to: sp.to, reason: sp.reason, halfDay: sp.half === '1' }} />
      </Card>
    </div>
  );
}
