import { getActorForApi } from '@/lib/auth/actor';
import { getAttachment } from '@/lib/services/leave';

/** Certificate download: owner, their reporting manager, or HR (same rule as approval). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActorForApi();
  if (actor instanceof Response) return actor;
  const { id } = await params;
  try {
    const a = await getAttachment(actor, id);
    return new Response(new Uint8Array(a.data), {
      headers: {
        'Content-Type': a.mime_type,
        'Content-Disposition': `inline; filename="${a.file_name.replace(/[^\w.\- ]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
