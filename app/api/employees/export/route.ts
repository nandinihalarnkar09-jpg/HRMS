import { getActorForApi } from '@/lib/auth/actor';
import { directoryCsv } from '@/lib/services/employees';
import { todayIST } from '@/lib/core/dates';

/** HR: employee directory CSV with PAN/Aadhaar/UAN/bank MASKED. */
export async function GET() {
  const actor = await getActorForApi();
  if (actor instanceof Response) return actor;
  if (!actor.isHrAdmin) return Response.json({ error: 'HR only' }, { status: 403 });
  const csv = await directoryCsv(actor);
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="lehar-employees-${todayIST()}.csv"`, 'Cache-Control': 'no-store' },
  });
}
