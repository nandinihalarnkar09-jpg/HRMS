/**
 * Leave module (L1–L8). Every exported function takes the actor first and authorizes.
 */
import { getDb, type Queryable, pgArray, pgConstraint, pgErrorCode } from '@/lib/db';
import { canApprove, ForbiddenError, NotFoundError, ValidationError, type Actor } from '@/lib/core/authz';
import { computeBalance, carryForward, type Balance } from '@/lib/core/leave-balance';
import { evaluateLeaveRequest, canCancel, halfDayLabel, type LeaveEvaluation } from '@/lib/core/leave-rules';
import { formatDate, todayIST, yearEnd, yearOf, yearStart, monthStart, monthEnd, eachDay, isValidISODate } from '@/lib/core/dates';
import { round2 } from '@/lib/core/leave-split';
import { getCalendar, getEmployeeCore, getLeaveTypes, requireHr, teamScope, type EmployeeCore, type LeaveTypeRow } from './common';
import { writeAudit } from './audit';
import { appUrl, sendEmail } from './email';

// ---------------------------------------------------------------- balances (L2)

export type BalanceRow = Balance & { leaveTypeId: number; halfDayAllowed: boolean };

async function balancesFor(q: Queryable, emp: EmployeeCore, year: number, today: string, opts: { excludeRequestId?: string } = {}): Promise<BalanceRow[]> {
  const types = await getLeaveTypes(q, { activeOnly: true });
  const stored = await q.query<{ leave_type_id: number; opening: number; adjustment: number }>(
    `select leave_type_id, opening, adjustment from leave_balances where employee_id = $1 and year = $2`, [emp.id, year]);
  const sums = await q.query<{ leave_type_id: number; used: number; pending: number }>(
    `select leave_type_id,
            coalesce(sum(paid_days) filter (where status = 'APPROVED'), 0) as used,
            coalesce(sum(paid_days) filter (where status = 'PENDING'), 0)  as pending
       from leave_requests
      where employee_id = $1 and from_date between $2 and $3 and id <> coalesce($4::uuid, '00000000-0000-0000-0000-000000000000')
      group by leave_type_id`, [emp.id, yearStart(year), yearEnd(year), opts.excludeRequestId ?? null]);
  return types.map((t) => {
    const s = stored.find((x) => x.leave_type_id === t.id);
    const u = sums.find((x) => x.leave_type_id === t.id);
    const b = computeBalance({
      type: t, year, today, doj: emp.date_of_joining, lwd: emp.last_working_day,
      opening: Number(s?.opening ?? 0), adjustment: Number(s?.adjustment ?? 0),
      used: Number(u?.used ?? 0), pending: Number(u?.pending ?? 0),
    });
    return { ...b, leaveTypeId: t.id, halfDayAllowed: t.halfDayAllowed };
  });
}

/** L2: balances for self, or for a team member (manager/HR). The SAME function feeds the agent. */
export async function getBalances(actor: Actor, employeeId: string = actor.id, year?: number): Promise<BalanceRow[]> {
  const q = getDb();
  const emp = await getEmployeeCore(q, employeeId);
  if (!emp) throw new NotFoundError('Employee not found.');
  if (emp.id !== actor.id && !actor.isHrAdmin && emp.reporting_manager_id !== actor.id) throw new ForbiddenError();
  const today = todayIST();
  return balancesFor(q, emp, year ?? yearOf(today), today);
}

// ---------------------------------------------------------------- preview / apply (L3)

export type LeaveInput = {
  leaveTypeCode: string;
  from: string;
  to: string;
  halfDay: boolean;
  /** 'FIRST' | 'SECOND'; required for a half day (R-LV-19) */
  halfDaySession?: string | null;
  reason: string;
  acceptLop?: boolean;
};

export type Attachment = { fileName: string; mimeType: string; base64: string; sizeBytes: number };

export type LeavePreview = LeaveEvaluation & { type: { code: string; name: string; halfDayAllowed: boolean }; balance: Balance | null };

async function evaluateFor(q: Queryable, emp: EmployeeCore, input: LeaveInput, hasCertificate: boolean, today: string, excludeRequestId?: string): Promise<{ preview: LeavePreview; type: LeaveTypeRow }> {
  const types = await getLeaveTypes(q, { activeOnly: true });
  const type = types.find((t) => t.code === String(input.leaveTypeCode).toUpperCase());
  if (!type) throw new ValidationError('Pick a valid leave type.');
  const validDates = isValidISODate(input.from) && isValidISODate(input.to);
  const year = validDates ? yearOf(input.from) : yearOf(today);
  const balances = await balancesFor(q, emp, year, today, { excludeRequestId });
  const balance = balances.find((b) => b.code === type.code)!;
  const calendar = validDates && input.to >= input.from
    ? await getCalendar(q, emp.location_id, input.from, input.to)
    : { weeklyOffDays: [], holidays: [] };
  const ev = evaluateLeaveRequest({
    type, from: input.from, to: input.to, halfDay: Boolean(input.halfDay), halfDaySession: input.halfDaySession ?? null, reason: input.reason ?? '', today,
    employee: { doj: emp.date_of_joining, lwd: emp.last_working_day, gender: emp.gender },
    calendar, balance, hasCertificate, acceptLop: Boolean(input.acceptLop),
  });
  return { preview: { ...ev, type: { code: type.code, name: type.name, halfDayAllowed: type.halfDayAllowed }, balance }, type };
}

/** Live preview for the apply form and the agent (no writes). Always for the actor themselves. */
export async function previewLeave(actor: Actor, input: LeaveInput, hasCertificate = false): Promise<LeavePreview> {
  const q = getDb();
  const emp = await getEmployeeCore(q, actor.id);
  if (!emp) throw new NotFoundError();
  return (await evaluateFor(q, emp, input, hasCertificate, todayIST())).preview;
}

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** L3: apply for leave (always for the actor; nobody applies on someone else's behalf). */
export async function applyLeave(actor: Actor, input: LeaveInput, attachment?: Attachment | null): Promise<{ id: string; preview: LeavePreview }> {
  if (attachment) {
    if (!ALLOWED_MIME.includes(attachment.mimeType)) throw new ValidationError('Certificate must be a PDF, JPG or PNG.');
    if (attachment.sizeBytes > MAX_ATTACHMENT_BYTES) throw new ValidationError('Certificate must be 2 MB or smaller.');
  }
  const db = getDb();
  const today = todayIST();
  const result = await db.tx(async (q) => {
    const emp = await getEmployeeCore(q, actor.id);
    if (!emp) throw new NotFoundError();
    // Serialise applications per employee so two tabs can't both pass the balance check
    await q.query(`select id from employees where id = $1 for update`, [emp.id]);
    const { preview, type } = await evaluateFor(q, emp, input, Boolean(attachment), today);
    if (!preview.ok) throw new ValidationError(preview.errors.join(' '), { lop: preview.lopOffer ? 'offer' : '' });
    let id: string;
    try {
      const rows = await q.query<{ id: string }>(
        `insert into leave_requests (employee_id, leave_type_id, from_date, to_date, is_half_day, half_day_session, days, paid_days, lop_days, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [emp.id, type.id, input.from, input.to, Boolean(input.halfDay), input.halfDay ? input.halfDaySession : null,
          preview.days, preview.paidDays, preview.lopDays, input.reason.trim()]);
      id = rows[0].id;
    } catch (e) {
      if (pgErrorCode(e) === '23P01' || pgConstraint(e) === 'leave_no_overlap') {
        throw new ValidationError('You already have a pending or approved leave request overlapping these dates.');
      }
      throw e;
    }
    if (attachment) {
      await q.query(
        `insert into leave_attachments (leave_request_id, file_name, mime_type, size_bytes, data) values ($1,$2,$3,$4, decode($5,'base64'))`,
        [id, attachment.fileName.slice(0, 200), attachment.mimeType, attachment.sizeBytes, attachment.base64]);
    }
    return { id, preview, emp, type };
  });

  // L6: email the reporting manager (or HR admins if none), outside the transaction
  const q = getDb();
  const approvers = result.emp.reporting_manager_id
    ? await q.query<{ email: string; full_name: string }>(`select email, full_name from employees where id = $1`, [result.emp.reporting_manager_id])
    : await q.query<{ email: string; full_name: string }>(`select email, full_name from employees where is_hr_admin and id <> $1`, [actor.id]);
  const p = result.preview;
  for (const a of approvers) {
    await sendEmail(q, {
      to: a.email,
      subject: `Leave request: ${actor.fullName} · ${p.type.code} · ${formatDate(input.from)}${input.from !== input.to ? ` to ${formatDate(input.to)}` : ''}`,
      text: [
        `Hi ${a.full_name},`, '',
        `${actor.fullName} (${actor.employeeCode}) has applied for ${p.type.name}.`,
        `Dates: ${formatDate(input.from)} – ${formatDate(input.to)}${input.halfDay ? ` (${halfDayLabel(input.halfDaySession).toLowerCase()})` : ''}`,
        `Working days: ${p.days}${p.lopDays ? ` (${p.paidDays} paid + ${p.lopDays} LOP)` : ''}`,
        `Reason: ${input.reason}`, '',
        `Review it in Lehar HR: ${appUrl('/approvals')}`,
      ].join('\n'),
      relatedId: result.id,
    });
  }
  return { id: result.id, preview: result.preview };
}

// ---------------------------------------------------------------- approve / reject (L4)

type RequestRow = {
  id: string; employee_id: string; leave_type_id: number; code: string; type_name: string; from_date: string; to_date: string;
  is_half_day: boolean; half_day_session: string | null; days: number; paid_days: number; lop_days: number; status: string; reason: string;
};

export async function decideLeave(actor: Actor, requestId: string, decision: 'APPROVED' | 'REJECTED', comment: string): Promise<void> {
  const db = getDb();
  const today = todayIST();
  if (decision === 'REJECTED' && comment.trim().length < 3) throw new ValidationError('Please add a comment explaining the rejection.');
  const done = await db.tx(async (q) => {
    const rows = await q.query<RequestRow>(
      `select r.*, t.code, t.name as type_name from leave_requests r join leave_types t on t.id = r.leave_type_id
        where r.id = $1 for update of r`, [requestId]);
    const r = rows[0];
    if (!r) throw new NotFoundError('Leave request not found.');
    const emp = (await getEmployeeCore(q, r.employee_id))!;
    // R-LV-11: reporting manager or HR, never own
    if (!canApprove(actor, { id: emp.id, reportingManagerId: emp.reporting_manager_id })) {
      throw new ForbiddenError(emp.id === actor.id ? 'You cannot approve or reject your own leave.' : 'Only the reporting manager or HR can decide this request.');
    }
    if (r.status !== 'PENDING') throw new ValidationError(`This request is already ${r.status.toLowerCase()}.`);

    if (decision === 'APPROVED') {
      // R-LV-12: lock the balance row, re-check inside the transaction
      const year = yearOf(r.from_date);
      await q.query(`insert into leave_balances (employee_id, leave_type_id, year) values ($1,$2,$3) on conflict do nothing`, [emp.id, r.leave_type_id, year]);
      await q.query(`select id from leave_balances where employee_id = $1 and leave_type_id = $2 and year = $3 for update`, [emp.id, r.leave_type_id, year]);
      const bal = (await balancesFor(q, emp, year, today, { excludeRequestId: r.id })).find((b) => b.leaveTypeId === r.leave_type_id)!;
      if (bal.available !== null && Number(r.paid_days) > bal.available + 1e-9) {
        throw new ValidationError(`Balance changed: ${emp.full_name} now has only ${bal.available} ${r.code} available, but this request needs ${r.paid_days}. Reject it, or ask them to re-apply with LOP.`);
      }
    }
    await q.query(
      `update leave_requests set status = $2, approver_id = $3, approver_comment = $4, decided_at = now() where id = $1`,
      [r.id, decision, actor.id, comment.trim() || null]);
    return { r, emp };
  });

  const q = getDb();
  await sendEmail(q, {
    to: done.emp.email,
    subject: `Your ${done.r.code} request was ${decision === 'APPROVED' ? 'approved' : 'rejected'}`,
    text: [
      `Hi ${done.emp.full_name},`, '',
      `Your ${done.r.type_name} request for ${formatDate(done.r.from_date)} – ${formatDate(done.r.to_date)}${done.r.is_half_day ? ` (${halfDayLabel(done.r.half_day_session).toLowerCase()})` : ''} (${done.r.days} day(s)) was ${decision.toLowerCase()} by ${actor.fullName}.`,
      comment.trim() ? `Comment: ${comment.trim()}` : '', '',
      `See your balance: ${appUrl('/leave')}`,
    ].filter((l) => l !== null).join('\n'),
    relatedId: done.r.id,
  });
}

// ---------------------------------------------------------------- cancel (L5)

export async function cancelLeave(actor: Actor, requestId: string): Promise<void> {
  const db = getDb();
  const today = todayIST();
  await db.tx(async (q) => {
    const rows = await q.query<RequestRow>(`select r.*, '' as code, '' as type_name from leave_requests r where r.id = $1 for update`, [requestId]);
    const r = rows[0];
    if (!r || r.employee_id !== actor.id) throw new NotFoundError('Leave request not found.'); // only your own
    if (!canCancel(r.status, r.from_date, today)) {
      throw new ValidationError(r.status === 'APPROVED' ? 'Approved leave can only be cancelled before it starts.' : `A ${r.status.toLowerCase()} request cannot be cancelled.`);
    }
    // Balance is restored automatically: used/pending are calculated from APPROVED/PENDING rows (D-2)
    await q.query(`update leave_requests set status = 'CANCELLED', cancelled_at = now() where id = $1`, [r.id]);
  });
}

// ---------------------------------------------------------------- lists

export type LeaveRequestView = {
  id: string; employee_id: string; employee_code: string; full_name: string; code: string; type_name: string;
  from_date: string; to_date: string; is_half_day: boolean; half_day_session: string | null; days: number; paid_days: number; lop_days: number;
  reason: string; status: string; approver_name: string | null; approver_comment: string | null;
  applied_at: Date; decided_at: Date | null; has_attachment: boolean; can_cancel?: boolean;
};

const VIEW_SQL = `
  select r.id, r.employee_id, e.employee_code, e.full_name, t.code, t.name as type_name, r.from_date, r.to_date,
         r.is_half_day, r.half_day_session, r.days, r.paid_days, r.lop_days, r.reason, r.status, a.full_name as approver_name,
         r.approver_comment, r.applied_at, r.decided_at,
         exists(select 1 from leave_attachments x where x.leave_request_id = r.id) as has_attachment
    from leave_requests r
    join employees e on e.id = r.employee_id
    join leave_types t on t.id = r.leave_type_id
    left join employees a on a.id = r.approver_id`;

export async function listMyRequests(actor: Actor, limit = 100): Promise<LeaveRequestView[]> {
  const today = todayIST();
  const rows = await getDb().query<LeaveRequestView>(`${VIEW_SQL} where r.employee_id = $1 order by r.from_date desc limit $2`, [actor.id, limit]);
  return rows.map((r) => ({ ...r, can_cancel: canCancel(r.status, r.from_date, today) }));
}

export type PendingWithContext = LeaveRequestView & { canApply: number | null; available: number | null; clashes: { name: string; from: string; to: string; status: string }[] };

/** Approvals inbox: requests the actor may decide (direct reports; HR: everyone), never their own. */
export async function listPendingForApprover(actor: Actor): Promise<PendingWithContext[]> {
  if (!actor.isHrAdmin && !actor.isManager) return [];
  const q = getDb();
  const rows = actor.isHrAdmin
    ? await q.query<LeaveRequestView & { reporting_manager_id: string | null }>(`${VIEW_SQL} where r.status = 'PENDING' and r.employee_id <> $1 order by r.from_date`, [actor.id])
    : await q.query<LeaveRequestView & { reporting_manager_id: string | null }>(`${VIEW_SQL} where r.status = 'PENDING' and e.reporting_manager_id = $1 and r.employee_id <> $1 order by r.from_date`, [actor.id]);
  const today = todayIST();
  const out: PendingWithContext[] = [];
  for (const r of rows) {
    const emp = (await getEmployeeCore(q, r.employee_id))!;
    const bal = (await balancesFor(q, emp, yearOf(r.from_date), today, { excludeRequestId: r.id })).find((b) => b.code === r.code);
    // Clash = a teammate (same manager) with approved/pending leave overlapping these dates
    const clashes = await q.query<{ name: string; from: string; to: string; status: string }>(
      `select e.full_name as name, r.from_date as "from", r.to_date as "to", r.status
         from leave_requests r join employees e on e.id = r.employee_id
        where r.status in ('PENDING','APPROVED') and r.employee_id <> $1
          and e.reporting_manager_id is not distinct from $2
          and r.from_date <= $4 and r.to_date >= $3
        order by r.from_date`, [emp.id, emp.reporting_manager_id, r.from_date, r.to_date]);
    out.push({ ...r, canApply: bal?.canApply ?? null, available: bal?.available ?? null, clashes });
  }
  return out;
}

/** L7: team leave on a month calendar (manager: direct reports; HR: all). */
export async function getTeamLeaveCalendar(actor: Actor, year: number, month: number) {
  const q = getDb();
  const from = monthStart(year, month);
  const to = monthEnd(year, month);
  const team = await teamScope(q, actor, { from, to });
  if (team.length === 0) return { from, to, days: eachDay(from, to), members: [], clashDates: [] as string[] };
  const reqs = await q.query<{ employee_id: string; code: string; from_date: string; to_date: string; status: string; is_half_day: boolean }>(
    `select r.employee_id, t.code, r.from_date, r.to_date, r.status, r.is_half_day
       from leave_requests r join leave_types t on t.id = r.leave_type_id
      where r.employee_id = any($1::uuid[]) and r.status in ('PENDING','APPROVED') and r.from_date <= $3 and r.to_date >= $2`,
    [pgArray(team.map((t) => t.id)), from, to]);
  const days = eachDay(from, to);
  const count = new Map<string, number>();
  const members = team.map((m) => {
    const cells: Record<string, { code: string; status: string; half: boolean }> = {};
    for (const r of reqs.filter((x) => x.employee_id === m.id)) {
      for (const d of days) if (d >= r.from_date && d <= r.to_date) {
        cells[d] = { code: r.code, status: r.status, half: r.is_half_day };
        count.set(d, (count.get(d) ?? 0) + 1);
      }
    }
    return { id: m.id, name: m.full_name, code: m.employee_code, locationId: m.location_id, cells };
  });
  return { from, to, days, members, clashDates: [...count.entries()].filter(([, n]) => n >= 2).map(([d]) => d) };
}

/** Certificate download: owner, their manager, or HR. */
export async function getAttachment(actor: Actor, requestId: string) {
  const q = getDb();
  const rows = await q.query<{ employee_id: string; reporting_manager_id: string | null; file_name: string; mime_type: string; data: Buffer }>(
    `select r.employee_id, e.reporting_manager_id, a.file_name, a.mime_type, a.data
       from leave_attachments a join leave_requests r on r.id = a.leave_request_id join employees e on e.id = r.employee_id
      where a.leave_request_id = $1`, [requestId]);
  const a = rows[0];
  if (!a) throw new NotFoundError();
  if (a.employee_id !== actor.id && !actor.isHrAdmin && a.reporting_manager_id !== actor.id) throw new NotFoundError();
  return a;
}

// ---------------------------------------------------------------- HR: adjustments and year-end

export async function adjustBalance(actor: Actor, employeeId: string, leaveTypeCode: string, year: number, delta: number, reason: string) {
  requireHr(actor);
  if (!reason || reason.trim().length < 5) throw new ValidationError('A reason (5+ characters) is required for a balance adjustment.');
  if (!Number.isFinite(delta) || delta === 0) throw new ValidationError('Enter a non-zero adjustment.');
  await getDb().tx(async (q) => {
    const t = (await getLeaveTypes(q)).find((x) => x.code === leaveTypeCode);
    if (!t) throw new ValidationError('Unknown leave type.');
    const rows = await q.query<{ id: string; adjustment: number }>(
      `insert into leave_balances (employee_id, leave_type_id, year, adjustment) values ($1,$2,$3,$4)
       on conflict (employee_id, leave_type_id, year) do update set adjustment = leave_balances.adjustment + excluded.adjustment
       returning id, adjustment`, [employeeId, t.id, year, delta]);
    await writeAudit(q, actor.id, [{
      tableName: 'leave_balances', recordId: rows[0].id, subjectEmployeeId: employeeId, action: 'BALANCE_ADJUSTMENT',
      field: `${t.code} ${year} adjustment`, oldValue: String(round2(rows[0].adjustment - delta)), newValue: String(rows[0].adjustment), reason,
    }]);
  });
}

/** R-LV-03: opening for `year+1` = min(closing of `year`, carry_forward_max). CL/SL lapse. Idempotent. */
export async function runCarryForward(actor: Actor, year: number): Promise<{ employees: number }> {
  requireHr(actor);
  const db = getDb();
  return db.tx(async (q) => {
    const emps = await q.query<{ id: string }>(
      `select id from employees where date_of_joining <= $1 and (last_working_day is null or last_working_day > $1)`, [yearEnd(year)]);
    const types = await getLeaveTypes(q, { activeOnly: true });
    for (const { id } of emps) {
      const emp = (await getEmployeeCore(q, id))!;
      const bals = await balancesFor(q, emp, year, yearEnd(year));
      for (const t of types) {
        const b = bals.find((x) => x.leaveTypeId === t.id);
        const opening = b && b.available !== null ? carryForward(b.available, t.carryForwardMax) : 0;
        await q.query(
          `insert into leave_balances (employee_id, leave_type_id, year, opening) values ($1,$2,$3,$4)
           on conflict (employee_id, leave_type_id, year) do update set opening = excluded.opening`, [id, t.id, year + 1, opening]);
      }
    }
    await writeAudit(q, actor.id, [{ tableName: 'leave_balances', recordId: String(year + 1), subjectEmployeeId: null, action: 'SETTINGS', field: 'carry_forward', newValue: `Opening balances for ${year + 1} set from ${year} closing` }]);
    return { employees: emps.length };
  });
}

/** Leave types this employee may apply for (gender-eligible, active). */
export async function applicableLeaveTypes(actor: Actor) {
  const q = getDb();
  const emp = await getEmployeeCore(q, actor.id);
  if (!emp) throw new NotFoundError();
  const types = await getLeaveTypes(q, { activeOnly: true });
  return types.filter((t) => !t.eligibleGender || t.eligibleGender === emp.gender)
    .map((t) => ({ code: t.code, name: t.name, halfDayAllowed: t.halfDayAllowed, certAfter: t.certRequiredAfterDays }));
}
