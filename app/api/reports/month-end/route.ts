import { getActorForApi } from '@/lib/auth/actor';
import { monthEndCsv } from '@/lib/services/reports';
import { ForbiddenError, ValidationError } from '@/lib/core/authz';

/** L8: month-end CSV. Manager: own team; HR: all. No statutory data at all. */
export async function GET(req: Request) {
  const actor = await getActorForApi();
  if (actor instanceof Response) return actor;
  const url = new URL(req.url);
  try {
    const { filename, csv } = await monthEndCsv(actor, Number(url.searchParams.get('y')), Number(url.searchParams.get('m')));
    return new Response('﻿' + csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: e.message }, { status: 403 });
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
