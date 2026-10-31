import { getActorForApi } from '@/lib/auth/actor';
import { runAgent, type ChatMessage } from '@/lib/agent/run';

export const maxDuration = 60;

/** Ask HR endpoint. The actor comes from the session (never from the request body). */
export async function POST(req: Request) {
  const actor = await getActorForApi();
  if (actor instanceof Response) return actor;
  const body = await req.json().catch(() => null) as { messages?: ChatMessage[] } | null;
  const messages = (body?.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return Response.json({ error: 'Send a question.' }, { status: 400 });
  try {
    const reply = await runAgent(actor, messages);
    return Response.json({
      text: reply.text,
      drafts: reply.drafts,
      tools: reply.calls.map((c) => ({ tool: c.tool, input: c.input, ok: c.ok })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('agent error', msg);
    if (/API_KEY|is not set/.test(msg)) return Response.json({ error: 'The assistant is not configured yet (missing AI API key).' }, { status: 503 });
    if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) return Response.json({ error: 'The AI API key was refused by Google. Ask HR to check GOOGLE_GENERATIVE_AI_API_KEY.' }, { status: 503 });
    if (/429|quota|rate|RESOURCE_EXHAUSTED|503|overloaded|high demand|timed? ?out|abort/i.test(msg)) return Response.json({ error: 'The assistant is busy (free-tier limit). Please try again in a minute.' }, { status: 503 });
    return Response.json({ error: 'The assistant could not answer right now. Please try again.' }, { status: 500 });
  }
}
