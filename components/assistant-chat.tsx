'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { confirmDraftAction, discardDraftAction } from '@/app/(app)/assistant/actions';
import { Alert, Button, btnClass, cx, inputClass } from './ui';

type Draft = { id: string; kind: string; summary: string; needsCertificate?: boolean; applyUrl?: string };
type ToolUse = { tool: string; input: unknown; ok: boolean };
type Msg = { role: 'user' | 'assistant'; content: string; tools?: ToolUse[]; drafts?: Draft[]; error?: boolean };

function DraftCard({ d }: { d: Draft }) {
  const [state, setState] = useState<{ ok?: boolean; message?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 rounded-[var(--radius-control)] border border-brand/40 bg-brand-soft/40 p-3 text-sm">
      <p className="font-semibold">{d.kind === 'LEAVE_REQUEST' ? 'Draft leave request' : 'Draft emails'}: {d.summary}</p>
      <p className="text-xs text-muted">Not submitted yet.</p>
      {state?.message ? <p className={cx('mt-2 font-medium', state.ok ? 'text-success' : 'text-danger')}>{state.message}</p> : (
        <div className="mt-2 flex flex-wrap gap-2">
          {d.needsCertificate ? (
            <Link href={d.applyUrl ?? '/leave/apply'} className={btnClass('primary', 'sm')}>Open Apply form to attach certificate</Link>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => start(async () => setState(await confirmDraftAction(d.id)))}>{pending ? 'Submitting…' : 'Confirm'}</Button>
          )}
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setState(await discardDraftAction(d.id)))}>Discard</Button>
        </div>
      )}
      {state?.error && <p className="mt-2 text-danger">{state.error}</p>}
    </div>
  );
}

const SUGGESTIONS = (manager: boolean, hr: boolean) => [
  'How many CL do I have?',
  'Kal ki chutti chahiye, kitni CL bachi hai?',
  'How many days if I take Friday to Monday off?',
  'What holidays are there this month?',
  ...(manager || hr ? ['Who in my team is absent today?', 'Summarise my pending approvals'] : []),
  ...(hr ? ['Run the month-end check'] : []),
];

export function AssistantChat({ isManager, isHr }: { isManager: boolean; isHr: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setInput(''); setBusy(true);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) }),
      });
      const body = await res.json().catch(() => ({}));
      setMsgs([...next, res.ok ? { role: 'assistant', content: body.text, tools: body.tools, drafts: body.drafts } : { role: 'assistant', content: body.error ?? 'Something went wrong.', error: true }]);
    } catch {
      setMsgs([...next, { role: 'assistant', content: 'Network error. Please try again.', error: true }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col rounded-[var(--radius-card)] border border-line bg-card md:h-[calc(100dvh-12rem)]">
      <div className="flex-1 overflow-y-auto p-3 md:p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="flex flex-col gap-3 py-6 text-center text-sm text-muted">
            <p>Ask about your leave balance, holidays, working days, or policy, in English or Hinglish. I can draft a leave request for you to confirm.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS(isManager, isHr).map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-ink hover:border-brand">{s}</button>)}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {msgs.map((m, i) => (
            <div key={i} className={cx('max-w-[90%] rounded-2xl px-3 py-2 text-sm md:max-w-[75%]', m.role === 'user' ? 'self-end bg-brand text-white' : m.error ? 'self-start border border-red-200 bg-red-50 text-red-900' : 'self-start bg-brand-50')}>
              <p className="whitespace-pre-wrap">{m.role === 'assistant' ? renderBold(m.content) : m.content}</p>
              {m.drafts?.map((d) => <DraftCard key={d.id} d={d} />)}
              {m.role === 'assistant' && !m.error && (
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer">{m.tools?.length ? `Tools used: ${m.tools.map((t) => t.tool).join(', ')}` : 'No tools used'}</summary>
                  <ul className="mt-1 flex flex-col gap-1 font-mono">
                    {m.tools?.map((t, j) => <li key={j}>{t.ok ? '✓' : '✗'} {t.tool}({JSON.stringify(t.input)})</li>)}
                  </ul>
                </details>
              )}
            </div>
          ))}
          {busy && <div className="self-start rounded-2xl bg-brand-50 px-3 py-2 text-sm text-muted">Checking…</div>}
          <div ref={endRef} />
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-line p-2 md:p-3">
        <label htmlFor="ask" className="sr-only">Ask a question</label>
        <input id="ask" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a question…" autoComplete="off" className={inputClass()} maxLength={1000} />
        <Button disabled={busy || !input.trim()} aria-label="Send">➤</Button>
      </form>
      <p className="px-3 pb-2 text-[11px] text-muted">The assistant uses the same permissions as you, never sees Aadhaar/PAN/bank data, and cannot submit or approve anything without your click.</p>
    </div>
  );
}

export function NotConfigured() {
  return <Alert kind="warning">The assistant needs an AI key (GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY). See README.</Alert>;
}

/** Show the model's **bold** as bold text; everything else stays plain text (no HTML is ever injected). */
function renderBold(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    /^\*\*[^*\n]+\*\*$/.test(part) ? <b key={i} className="font-semibold">{part.slice(2, -2)}</b> : part);
}
