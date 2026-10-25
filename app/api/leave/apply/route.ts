import { revalidatePath } from 'next/cache';
import { getActorForApi } from '@/lib/auth/actor';
import { applyLeave, MAX_ATTACHMENT_BYTES } from '@/lib/services/leave';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/core/authz';

/** L3: apply for leave (multipart, so a medical certificate up to 2 MB can be attached). */
export async function POST(req: Request) {
  const actor = await getActorForApi();
  if (actor instanceof Response) return actor;
  const fd = await req.formData();
  const s = (k: string) => (typeof fd.get(k) === 'string' ? String(fd.get(k)) : '');
  const file = fd.get('certificate');
  let attachment = null;
  if (file && typeof file === 'object' && 'arrayBuffer' in file && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) return Response.json({ error: 'Certificate must be 2 MB or smaller.' }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    attachment = { fileName: file.name || 'certificate', mimeType: file.type, base64: buf.toString('base64'), sizeBytes: buf.length };
  }
  try {
    const r = await applyLeave(actor, {
      leaveTypeCode: s('leaveTypeCode'), from: s('from'), to: s('to'), halfDay: s('halfDay') === 'true',
      reason: s('reason'), acceptLop: s('acceptLop') === 'true',
    }, attachment);
    revalidatePath('/', 'layout');
    return Response.json({ id: r.id, days: r.preview.days, paidDays: r.preview.paidDays, lopDays: r.preview.lopDays });
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return Response.json({ error: e.message }, { status: 403 });
    console.error(e);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
