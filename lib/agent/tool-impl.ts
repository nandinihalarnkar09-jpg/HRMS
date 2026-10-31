/**
 * Agent tool implementations (ARCHITECTURE §6.1). Each one wraps an EXISTING service, so the
 * same role checks apply as on the screens. No tool can return PAN, Aadhaar, UAN, bank or
 * salary data: the statutory service is not imported here.
 *
 * The AI SDK wiring (lib/agent/ai-tools.ts) only adds descriptions and input schemas on top.
 */
import { getDb } from '@/lib/db';
import type { Actor } from '@/lib/core/authz';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/core/authz';
import { countLeaveDays } from '@/lib/core/calendar';
import { addDays, formatDate, isValidISODate, monthOf, todayIST, weekdayName, yearOf } from '@/lib/core/dates';
import { containsSensitiveId, redactPii } from '@/lib/core/redact';
import { halfDayLabel, type HalfDaySession } from '@/lib/core/leave-rules';
import { getBalances, listPendingForApprover, previewLeave } from '@/lib/services/leave';
import { getTeamToday } from '@/lib/services/attendance';
import { listHolidays, searchPolicyText } from '@/lib/services/settings';
import { monthEndExceptions } from '@/lib/services/reports';
import { createDraft } from '@/lib/services/drafts';
import { getCalendar, getEmployeeCore } from '@/lib/services/common';

export const MAX_TOOL_CALLS = 5;

export type ToolCallRecord = { tool: string; input: unknown; ok: boolean; result: unknown };
export type DraftCard = { id: string; kind: 'LEAVE_REQUEST' | 'HR_REMINDER_EMAIL'; summary: string; needsCertificate?: boolean; applyUrl?: string };

export type AgentContext = {
  actor: Actor;
  requestId: string;
  calls: ToolCallRecord[];
  drafts: DraftCard[];
  /** The half of the day the user last named in this chat (undefined = not checked, e.g. in tests). */
  userSlot?: HalfDaySession | null;
};

export function newContext(actor: Actor): AgentContext {
  return { actor, requestId: crypto.randomUUID(), calls: [], drafts: [] };
}

/** Budget + logging + error mapping around every tool (guardrails: 5 calls, agent_log). */
export async function runTool<T>(ctx: AgentContext, tool: string, input: unknown, fn: () => Promise<T>): Promise<T | { error: string; message: string }> {
  let result: T | { error: string; message: string };
  let ok = true;
  if (ctx.calls.length >= MAX_TOOL_CALLS) {
    result = { error: 'TOOL_LIMIT', message: `Tool limit of ${MAX_TOOL_CALLS} calls per question reached. Answer with what you have or ask the user to ask a narrower question.` };
    ok = false;
  } else {
    try {
      result = await fn();
    } catch (e) {
      ok = false;
      if (e instanceof ForbiddenError) result = { error: 'FORBIDDEN', message: e.message };
      else if (e instanceof ValidationError) result = { error: 'INVALID', message: e.message };
      else if (e instanceof NotFoundError) result = { error: 'NOT_FOUND', message: 'Not found.' };
      else { console.error(e); result = { error: 'FAILED', message: 'The tool failed. Tell the user to try again later.' }; }
    }
  }
  // Belt and braces: no full identifier may ever leave a tool
  const json = JSON.stringify(result);
  if (containsSensitiveId(json)) result = JSON.parse(redactPii(json));
  ctx.calls.push({ tool, input, ok, result });
  try {
    await getDb().query(`insert into agent_log (employee_id, request_id, tool, inputs, result, ok) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
      [ctx.actor.id, ctx.requestId, tool, JSON.stringify(input ?? {}), JSON.stringify(result ?? null), ok]);
  } catch (e) { console.error('agent_log insert failed', e); }
  return result;
}

const notDate = (d: string) => !isValidISODate(d);

// ---------------------------------------------------------------- 1. get_my_leave_balance
export function getMyLeaveBalance(ctx: AgentContext, input: { year?: number }) {
  return runTool(ctx, 'get_my_leave_balance', input, async () => {
    const b = await getBalances(ctx.actor, ctx.actor.id, input.year ?? undefined);
    return {
      year: input.year ?? yearOf(todayIST()),
      balances: b.map((x) => ({
        code: x.code, name: x.name,
        opening: x.opening, accrued: x.accrued, used: x.used, pending: x.pending,
        available: x.available, can_still_apply_for: x.canApply,
        per_event_entitlement_days: x.perEvent, unlimited_unpaid: x.unlimited,
      })),
      note: 'available = opening + accrued + adjustment - used. Pending requests are not deducted from available.',
    };
  });
}

// ---------------------------------------------------------------- 2. get_holidays
export function getHolidays(ctx: AgentContext, input: { year: number; month?: number }) {
  return runTool(ctx, 'get_holidays', input, async () => {
    const year = Number(input.year) || yearOf(todayIST());
    const month = input.month ? Number(input.month) : undefined;
    if (month !== undefined && (month < 1 || month > 12)) throw new ValidationError('month must be 1-12');
    const rows = await listHolidays(ctx.actor, { year, month }); // own location only
    return {
      location: rows[0]?.location_name ?? null, year, month: month ?? null,
      holidays: rows.map((h) => ({ date: h.date, weekday: weekdayName(h.date), name: h.name, type: h.type, day_off: h.type !== 'OPTIONAL' })),
      note: 'OPTIONAL holidays are working days (apply CL to take one off).',
    };
  });
}

// ---------------------------------------------------------------- 3. count_working_days
export function countWorkingDays(ctx: AgentContext, input: { from_date: string; to_date: string; half_day?: boolean }) {
  return runTool(ctx, 'count_working_days', input, async () => {
    if (notDate(input.from_date) || notDate(input.to_date)) throw new ValidationError('Dates must be YYYY-MM-DD.');
    if (input.to_date < input.from_date) throw new ValidationError('to_date is before from_date.');
    if (input.to_date > addDays(input.from_date, 366)) throw new ValidationError('Range too long (max 1 year).');
    const emp = await getEmployeeCore(getDb(), ctx.actor.id);
    if (!emp) throw new NotFoundError();
    const cal = await getCalendar(getDb(), emp.location_id, input.from_date, input.to_date);
    const half = Boolean(input.half_day) && input.from_date === input.to_date;
    const r = countLeaveDays({ from: input.from_date, to: input.to_date, halfDay: half, calendar: cal });
    return {
      location: emp.location_name, from: input.from_date, to: input.to_date,
      working_days: r.days,
      counted_dates: r.charged.map((c) => `${c.date} (${weekdayName(c.date)})${c.portion < 1 ? ' half' : ''}`),
      not_counted: r.excluded.map((x) => `${x.date} (${weekdayName(x.date)}): ${x.reason === 'HOLIDAY' ? `holiday – ${x.name}` : 'weekly off'}`),
      rule: 'Weekly offs and holidays are never counted (no sandwich rule).',
    };
  });
}

// ---------------------------------------------------------------- 4. explain_policy
export function explainPolicy(ctx: AgentContext, input: { question: string }) {
  return runTool(ctx, 'explain_policy', input, async () => {
    const r = await searchPolicyText(String(input.question ?? '').slice(0, 500));
    if (!r.found) return { found: false, message: 'The stored policy text does not cover this. Say you do not know and suggest contacting HR.' };
    return { found: true, sections: r.sections.map((s) => ({ section: s.heading, text: s.text })), instruction: 'Answer ONLY from these sections.' };
  });
}

// ---------------------------------------------------------------- 5. draft_leave_request (write → confirmed by a human)
export function draftLeaveRequest(ctx: AgentContext, input: { leave_type_code: string; from_date: string; to_date: string; half_day?: boolean; half_day_session?: 'FIRST' | 'SECOND'; reason: string; convert_excess_to_lop?: boolean }) {
  return runTool(ctx, 'draft_leave_request', input, async () => {
    const code = String(input.leave_type_code ?? '').toUpperCase();
    // R-LV-19: never guess the half. If the user didn't say it, the model must ask first.
    if (input.half_day && input.half_day_session && ctx.userSlot !== undefined && ctx.userSlot !== input.half_day_session) {
      return {
        draft_created: false,
        errors: ['The user has not said which half of the day.'],
        next_step: 'Ask the user: first half (morning) or second half (afternoon)? Do not assume. Draft only after they answer.',
      };
    }
    const leaveInput = { leaveTypeCode: code, from: input.from_date, to: input.to_date, halfDay: Boolean(input.half_day), halfDaySession: input.half_day ? input.half_day_session ?? null : null, reason: String(input.reason ?? '').trim() || 'Personal work', acceptLop: Boolean(input.convert_excess_to_lop) };
    // Evaluate exactly like the Apply form; a missing certificate doesn't block a DRAFT (the form will ask for it)
    const p = await previewLeave(ctx.actor, leaveInput, true);
    const needsCertificate = p.needsCertificate;
    if (!p.ok) {
      return {
        draft_created: false, errors: p.errors, working_days: p.days,
        lop_offer: p.lopOffer ? { paid_days: p.lopOffer.paidDays, lop_days: p.lopOffer.lopDays, hint: 'Ask the user if they want the excess as Loss of Pay; if yes call again with convert_excess_to_lop=true.' } : null,
      };
    }
    const draftId = await createDraft(ctx.actor, 'LEAVE_REQUEST', { ...leaveInput, needsCertificate, days: p.days, paidDays: p.paidDays, lopDays: p.lopDays });
    const summary = `${code} · ${formatDate(leaveInput.from)}${leaveInput.to !== leaveInput.from ? ` – ${formatDate(leaveInput.to)}` : ''}${leaveInput.halfDay ? ` (${halfDayLabel(leaveInput.halfDaySession).toLowerCase()})` : ''} · ${p.days} working day(s)${p.lopDays ? ` = ${p.paidDays} ${code} + ${p.lopDays} LOP` : ''}`;
    const applyUrl = `/leave/apply?type=${code}&from=${leaveInput.from}&to=${leaveInput.to}${leaveInput.halfDay ? `&half=1${leaveInput.halfDaySession ? `&session=${leaveInput.halfDaySession}` : ''}` : ''}&reason=${encodeURIComponent(leaveInput.reason)}`;
    ctx.drafts.push({ id: draftId, kind: 'LEAVE_REQUEST', summary, needsCertificate, applyUrl });
    return {
      draft_created: true, draft_id: draftId, submitted: false,
      summary, working_days: p.days, paid_days: p.paidDays, lop_days: p.lopDays,
      not_counted: p.excluded.map((x) => `${x.date}: ${x.reason === 'HOLIDAY' ? x.name : 'weekly off'}`),
      needs_certificate: needsCertificate,
      instruction: needsCertificate
        ? 'Tell the user a medical certificate is required; they must open the Apply form (button shown) to attach it. Nothing is submitted yet.'
        : 'Tell the user the draft is ready and NOTHING is submitted until they click Confirm below your answer.',
    };
  });
}

// ---------------------------------------------------------------- 6. get_team_today (managers / HR)
export function teamToday(ctx: AgentContext, input: { only_absent_or_leave?: boolean }) {
  return runTool(ctx, 'get_team_today', input, async () => {
    if (!ctx.actor.isManager && !ctx.actor.isHrAdmin) throw new ForbiddenError('Only managers (for their direct reports) and HR can see team attendance.');
    const rows = await getTeamToday(ctx.actor);
    const list = rows
      .filter((r) => !input.only_absent_or_leave || ['ABSENT', 'ON_LEAVE'].includes(r.status) || (r.status === 'IN_PROGRESS' && !r.checkIn))
      .map((r) => ({
        name: r.full_name, code: r.employee_code,
        status: r.status === 'IN_PROGRESS' ? (r.checkIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN_YET') : r.status,
        leave_type: r.leaveTypeCode, late: r.isLate,
      }));
    const count = (s: string) => list.filter((x) => x.status === s).length;
    return {
      scope: ctx.actor.isHrAdmin ? 'all employees' : 'your direct reports', date: todayIST(), total: rows.length,
      counts: { present_or_checked_in: count('PRESENT') + count('WFH') + count('HALF_DAY') + count('CHECKED_IN'), on_leave: count('ON_LEAVE'), absent: count('ABSENT'), not_checked_in_yet: count('NOT_CHECKED_IN_YET') },
      people: list,
    };
  });
}

// ---------------------------------------------------------------- 7. summarise_pending_approvals (managers / HR)
export function summarisePending(ctx: AgentContext, input: { limit?: number }) {
  return runTool(ctx, 'summarise_pending_approvals', input, async () => {
    if (!ctx.actor.isManager && !ctx.actor.isHrAdmin) throw new ForbiddenError('Only managers and HR have approvals.');
    const rows = await listPendingForApprover(ctx.actor);
    return {
      pending_count: rows.length,
      requests: rows.slice(0, Math.min(20, Number(input.limit) || 20)).map((r) => ({
        employee: r.full_name, code: r.employee_code, type: r.code, from: r.from_date, to: r.to_date, half_day: r.is_half_day, half_day_session: r.half_day_session,
        days: r.days, paid_days: r.paid_days, lop_days: r.lop_days, reason: r.reason,
        balance_available: r.available, balance_after_approval: r.available !== null ? Math.round((r.available - r.paid_days) * 100) / 100 : null,
        clash_warnings: r.clashes.map((c) => `${c.name} is ${c.status.toLowerCase()} on leave ${c.from}${c.to !== c.from ? ` to ${c.to}` : ''}`),
      })),
      note: 'You cannot approve or reject. The manager must use the Approvals screen.',
    };
  });
}

// ---------------------------------------------------------------- 8. month_end_check (extra tool, HR only)
export function monthEndCheck(ctx: AgentContext, input: { year?: number; month?: number }) {
  return runTool(ctx, 'month_end_check', input, async () => {
    if (!ctx.actor.isHrAdmin) throw new ForbiddenError('The month-end check is for HR Admin only.');
    const t = todayIST();
    const year = Number(input.year) || yearOf(t);
    const month = Number(input.month) || monthOf(t);
    const flagged = await monthEndExceptions(ctx.actor, year, month);
    if (flagged.length === 0) return { year, month, flagged: [], draft_created: false, message: 'No employee has 3+ Late marks or missed punches this month.' };
    // The emails live only in the draft (DB); the model never sees email addresses
    const q = getDb();
    const emails: { to: string; subject: string; text: string }[] = [];
    for (const f of flagged) {
      const r = await q.query<{ email: string }>(`select email from employees where employee_code = $1`, [f.employee_code]);
      if (!r[0]) continue;
      const parts = [f.late_marks >= 3 ? `${f.late_marks} Late marks (${f.late_penalty_lop} day LOP under the 3-lates rule)` : '', f.missed_punches ? `${f.missed_punches} missed punch(es)` : ''].filter(Boolean);
      emails.push({
        to: r[0].email,
        subject: `Attendance reminder for ${year}-${String(month).padStart(2, '0')}`,
        text: `Hi ${f.name.split(' ')[0]},\n\nOur records for this month show ${parts.join(' and ')}. Please raise a regularisation request in Lehar HR for any missed punch before month-end, and try to check in by 10:15 AM.\n\nThanks,\nHR, Konkan Coastal Foods`,
      });
    }
    const draftId = await createDraft(ctx.actor, 'HR_REMINDER_EMAIL', { year, month, emails });
    ctx.drafts.push({ id: draftId, kind: 'HR_REMINDER_EMAIL', summary: `Reminder email to ${emails.length} employee(s) for ${year}-${String(month).padStart(2, '0')}` });
    return { year, month, flagged, draft_created: true, draft_id: draftId, emails_drafted: emails.length, instruction: 'Tell HR the reminder emails are drafted and are sent only when they click Confirm.' };
  });
}
