/**
 * The agent loop: Vercel AI SDK generateText with tools. The model only chooses tools and
 * inputs; every tool runs on the server as the signed-in user (ARCHITECTURE §6).
 */
import { generateText, stepCountIs, tool, type ModelMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import type { Actor } from '@/lib/core/authz';
import { redactPii } from '@/lib/core/redact';
import { listLocations } from '@/lib/services/settings';
import {
  MAX_TOOL_CALLS, newContext, countWorkingDays, draftLeaveRequest, explainPolicy, getHolidays, getMyLeaveBalance,
  monthEndCheck, summarisePending, teamToday, type AgentContext, type DraftCard, type ToolCallRecord,
} from './tool-impl';
import { systemPrompt } from './prompt';
import { guardUnsupportedNumbers } from './guard';

export { guardUnsupportedNumbers };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date as YYYY-MM-DD (IST calendar date)');

/** Tool descriptions are written like instructions to a new colleague (brief tip 3). */
export function buildTools(ctx: AgentContext) {
  const tools = {
    get_my_leave_balance: tool({
      description: "Get the signed-in user's own leave balance per leave type (CL, SL, EL, maternity/paternity entitlement, LOP): opening, accrued, used, pending, available and how much can still be applied for. Use for ANY question about how much leave the user has. It cannot look up other employees.",
      inputSchema: z.object({ year: z.number().int().min(2000).max(2100).optional().describe('Leave year; omit for the current year') }),
      execute: async (input) => getMyLeaveBalance(ctx, input),
    }),
    get_holidays: tool({
      description: "List holidays at the user's OWN location for a year or a single month (National, State, Optional). Optional holidays are working days. Use when asked about holidays or before planning leave around festivals.",
      inputSchema: z.object({ year: z.number().int().min(2000).max(2100).describe('Calendar year, e.g. 2026'), month: z.number().int().min(1).max(12).optional().describe('1-12; omit for the whole year') }),
      execute: async (input) => getHolidays(ctx, input),
    }),
    count_working_days: tool({
      description: "Count how many LEAVE days a date range costs the user: working days only, excluding their location's weekly offs and holidays (no sandwich rule). Always use this for 'how many days if I take X to Y'. Give half_day=true only for a single date.",
      inputSchema: z.object({ from_date: date, to_date: date, half_day: z.boolean().optional() }),
      execute: async (input) => countWorkingDays(ctx, input),
    }),
    explain_policy: tool({
      description: "Search the company's stored leave and attendance policy text and return the matching sections. Use for any 'what is the rule / policy' question. If it returns found=false the policy does not cover it: say you don't know.",
      inputSchema: z.object({ question: z.string().min(2).max(500).describe("The user's policy question, in their words") }),
      execute: async (input) => explainPolicy(ctx, input),
    }),
    draft_leave_request: tool({
      description: "Prepare (but NOT submit) a leave request for the signed-in user. It validates exactly like the Apply form and returns a draft the user must Confirm with a button. If the balance is short it returns lop_offer: ask the user, and only if they agree call again with convert_excess_to_lop=true. Leave types: CL, SL, EL, ML, PL, LOP.",
      inputSchema: z.object({
        leave_type_code: z.enum(['CL', 'SL', 'EL', 'ML', 'PL', 'LOP']).describe('CL casual, SL sick, EL earned, ML maternity, PL paternity, LOP loss of pay'),
        from_date: date, to_date: date,
        half_day: z.boolean().optional().describe('Only for a single date and only CL/SL/LOP'),
        half_day_session: z.enum(['FIRST', 'SECOND']).optional().describe('Required when half_day=true: FIRST = first half (morning), SECOND = second half (afternoon). If the user did not say which half, ASK them; never guess.'),
        reason: z.string().min(3).max(300).describe('Short reason in the user’s words'),
        convert_excess_to_lop: z.boolean().optional().describe('Only true after the user agreed to convert excess days to Loss of Pay'),
      }),
      execute: async (input) => draftLeaveRequest(ctx, input),
    }),
    get_team_today: tool({
      description: "MANAGERS/HR ONLY. Who in the user's team (direct reports; HR: everyone) is present, on leave, absent or not checked in yet today. Returns FORBIDDEN for other users.",
      inputSchema: z.object({ only_absent_or_leave: z.boolean().optional().describe('true to list only people who are away') }),
      execute: async (input) => teamToday(ctx, input),
    }),
    summarise_pending_approvals: tool({
      description: "MANAGERS/HR ONLY. List leave requests waiting for this user's approval, with each requester's balance before/after and clash warnings when teammates are away on the same dates. Read-only: you cannot approve or reject.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      execute: async (input) => summarisePending(ctx, input),
    }),
    month_end_check: tool({
      description: "HR ADMIN ONLY. Month-end attendance check: finds employees with 3+ Late marks or missed punches in a month and DRAFTS reminder emails for HR to confirm. Nothing is sent until HR clicks Confirm.",
      inputSchema: z.object({ year: z.number().int().min(2000).max(2100).optional(), month: z.number().int().min(1).max(12).optional() }),
      execute: async (input) => monthEndCheck(ctx, input),
    }),
  };
  return tools;
}

export function getModel() {
  const provider = (process.env.AI_PROVIDER ?? 'google').toLowerCase();
  if (provider === 'groq') {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
    return createGroq({ apiKey: process.env.GROQ_API_KEY })(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(process.env.GEMINI_MODEL || 'gemini-flash-latest');
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type AgentReply = { text: string; calls: ToolCallRecord[]; drafts: DraftCard[]; requestId: string };

export async function runAgent(actor: Actor, history: ChatMessage[], now = new Date()): Promise<AgentReply> {
  const ctx = newContext(actor);
  const loc = (await listLocations()).find((l) => l.id === actor.locationId);
  const offs = (loc?.weekly_off_days ?? []).map((d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]).join(' & ') || 'none';
  // PII never reaches the model: redact every user message (Aadhaar, PAN, account numbers…)
  const messages: ModelMessage[] = history.slice(-10).map((m): ModelMessage => {
    const content = redactPii(String(m.content).slice(0, 2000));
    return m.role === 'user' ? { role: 'user', content } : { role: 'assistant', content };
  });

  const result = await generateText({
    model: getModel(),
    system: systemPrompt(actor, { name: loc?.name ?? 'unknown', weeklyOffs: offs }, now),
    messages,
    tools: buildTools(ctx),
    stopWhen: stepCountIs(MAX_TOOL_CALLS + 1), // ≤5 tool rounds + a final answer; the budget wrapper also hard-limits calls
    temperature: 0,
    maxRetries: 1,
  });

  let text = (result.text ?? '').trim();
  if (!text) text = ctx.calls.length >= MAX_TOOL_CALLS ? 'That needed too many lookups. Please ask a narrower question.' : 'Sorry, I could not answer that.';
  text = guardUnsupportedNumbers(text, ctx.calls);
  return { text: redactPii(text), calls: ctx.calls, drafts: ctx.drafts, requestId: ctx.requestId };
}
