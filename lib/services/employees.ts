/**
 * Employee Master (E1–E8).
 */
import { getDb, type Queryable, pgConstraint, pgErrorCode } from '@/lib/db';
import { canEditContact, canRevealSensitive, canViewProfile, ForbiddenError, NotFoundError, ValidationError, type Actor } from '@/lib/core/authz';
import { maskAadhaar, maskAccount, maskPan, maskUan } from '@/lib/core/masking';
import { todayIST, yearOf, isValidISODate } from '@/lib/core/dates';
import { validateEmployee, type EmployeeFormInput, type FieldErrors } from '@/lib/core/validation';
import { toCsv } from '@/lib/core/summary';
import { getLeaveTypes, requireHr } from './common';
import { writeAudit, type AuditEntry } from './audit';

export type EmployeeListRow = {
  id: string; employee_code: string; full_name: string; email: string; designation: string;
  department_name: string; location_name: string; manager_name: string | null; date_of_joining: string;
  last_working_day: string | null; active: boolean; is_hr_admin: boolean;
};

export type DirectoryFilter = { q?: string; departmentId?: number; locationId?: number; status?: 'active' | 'inactive' | 'all' };

const ACTIVE = `(e.last_working_day is null or e.last_working_day >= $1)`;

/** E2: searchable directory (HR only). */
export async function listEmployees(actor: Actor, f: DirectoryFilter = {}): Promise<EmployeeListRow[]> {
  requireHr(actor);
  const params: unknown[] = [todayIST()];
  const where: string[] = [];
  if (f.q?.trim()) { params.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(lower(e.full_name) like $${params.length} or lower(e.employee_code) like $${params.length} or lower(e.email) like $${params.length})`); }
  if (f.departmentId) { params.push(f.departmentId); where.push(`e.department_id = $${params.length}`); }
  if (f.locationId) { params.push(f.locationId); where.push(`e.location_id = $${params.length}`); }
  if (f.status === 'active' || !f.status) where.push(ACTIVE);
  if (f.status === 'inactive') where.push(`not ${ACTIVE}`);
  return getDb().query<EmployeeListRow>(
    `select e.id, e.employee_code, e.full_name, e.email, e.designation, d.name as department_name, l.name as location_name,
            m.full_name as manager_name, e.date_of_joining, e.last_working_day, ${ACTIVE} as active, e.is_hr_admin
       from employees e join departments d on d.id = e.department_id join locations l on l.id = e.location_id
       left join employees m on m.id = e.reporting_manager_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by e.employee_code`, params);
}

export type EmployeeProfile = {
  id: string; employee_code: string; full_name: string; email: string; mobile: string; dob: string; gender: string;
  date_of_joining: string; last_working_day: string | null; designation: string; department_id: number; department_name: string;
  location_id: number; location_name: string; reporting_manager_id: string | null; manager_name: string | null; manager_code: string | null;
  salary_grade: string; is_hr_admin: boolean; address_line1: string; address_line2: string; city: string; state: string; pincode: string;
  emergency_contact_name: string; emergency_contact_relation: string; emergency_contact_phone: string | null; active: boolean;
};

export type MaskedStatutory = {
  pan: string; aadhaar: string; uan: string;
  account: string; ifsc: string; bankName: string; accountHolder: string;
};

/** E3: profile. Own or HR only; anyone else gets NotFound (no hint the id exists). */
export async function getEmployeeProfile(actor: Actor, id: string): Promise<EmployeeProfile> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const rows = await getDb().query<EmployeeProfile>(
    `select e.id, e.employee_code, e.full_name, e.email, e.mobile, e.dob, e.gender, e.date_of_joining, e.last_working_day,
            e.designation, e.department_id, d.name as department_name, e.location_id, l.name as location_name,
            e.reporting_manager_id, m.full_name as manager_name, m.employee_code as manager_code, e.salary_grade, e.is_hr_admin,
            e.address_line1, e.address_line2, e.city, e.state, e.pincode,
            e.emergency_contact_name, e.emergency_contact_relation, e.emergency_contact_phone, ${ACTIVE} as active
       from employees e join departments d on d.id = e.department_id join locations l on l.id = e.location_id
       left join employees m on m.id = e.reporting_manager_id
      where e.id = $2`, [todayIST(), id]);
  const p = rows[0];
  if (!p || !canViewProfile(actor, { id: p.id, reportingManagerId: p.reporting_manager_id })) throw new NotFoundError();
  return p;
}

/**
 * Run a read as the signed-in user with RLS enforced by Postgres (ARCHITECTURE §4.3).
 * Statutory and bank reads always go through here.
 */
export async function withRls<T>(actor: Actor, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return getDb().tx(async (q) => {
    await q.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ email: actor.email, sub: actor.id, role: 'authenticated' })]);
    await q.query(`set local role authenticated`);
    return fn(q);
  });
}

/** E7: masked statutory + bank. Selects ONLY aadhaar_last4/account_last4, never the full values. */
export async function getStatutoryMasked(actor: Actor, employeeId: string): Promise<MaskedStatutory> {
  await getEmployeeProfile(actor, employeeId); // same visibility as the profile
  return withRls(actor, async (q) => {
    const s = await q.query<{ pan: string; aadhaar_last4: string; uan: string | null }>(
      `select pan, aadhaar_last4, uan from employee_statutory where employee_id = $1`, [employeeId]);
    const b = await q.query<{ account_last4: string; ifsc: string; bank_name: string; account_holder_name: string }>(
      `select account_last4, ifsc, bank_name, account_holder_name from employee_bank where employee_id = $1`, [employeeId]);
    return {
      pan: maskPan(s[0]?.pan), aadhaar: maskAadhaar(s[0]?.aadhaar_last4), uan: maskUan(s[0]?.uan),
      account: maskAccount(b[0]?.account_last4), ifsc: b[0]?.ifsc ?? '—', bankName: b[0]?.bank_name ?? '—', accountHolder: b[0]?.account_holder_name ?? '—',
    };
  });
}

/** R-EMP-11: HR reveals PAN or bank account; every reveal is audited. Aadhaar: never (D-3). */
export async function revealSensitive(actor: Actor, employeeId: string, field: 'pan' | 'account_number'): Promise<string> {
  if (!canRevealSensitive(actor, field)) throw new ForbiddenError(field === ('aadhaar' as string) ? 'Aadhaar is never revealed.' : 'Only HR Admin can reveal this.');
  const value = await withRls(actor, async (q) => {
    const rows = field === 'pan'
      ? await q.query<{ v: string }>(`select pan as v from employee_statutory where employee_id = $1`, [employeeId])
      : await q.query<{ v: string }>(`select account_number as v from employee_bank where employee_id = $1`, [employeeId]);
    return rows[0]?.v;
  });
  if (!value) throw new NotFoundError();
  await writeAudit(getDb(), actor.id, [{
    tableName: field === 'pan' ? 'employee_statutory' : 'employee_bank', recordId: employeeId, subjectEmployeeId: employeeId,
    action: 'REVEAL', field, newValue: null, reason: `${actor.fullName} revealed ${field === 'pan' ? 'PAN' : 'bank account number'}`,
  }]);
  return value;
}

// ---------------------------------------------------------------- create / update

function mapDbError(e: unknown): never {
  const c = pgConstraint(e) ?? '';
  const code = pgErrorCode(e);
  const msg = e instanceof Error ? e.message : '';
  if (code === '23505' && c.includes('email')) throw new ValidationError('Please fix the highlighted fields.', { email: 'Another employee already uses this email.' });
  if (code === '23505' && c.includes('pan')) throw new ValidationError('Please fix the highlighted fields.', { pan: 'This PAN belongs to another employee.' });
  if (code === '23505' && c.includes('uan')) throw new ValidationError('Please fix the highlighted fields.', { uan: 'This UAN belongs to another employee.' });
  if (msg.includes('R-EMP-09')) throw new ValidationError('Please fix the highlighted fields.', { reporting_manager_id: 'This would create a reporting loop: the chosen manager already reports to this employee.' });
  if (c === 'employee_min_age_18') throw new ValidationError('Please fix the highlighted fields.', { dob: 'Employee must be at least 18 years old on the date of joining.' });
  if (c === 'employee_lwd_after_doj') throw new ValidationError('The last working day cannot be before the date of joining.');
  throw e;
}

async function checkManager(q: Queryable, managerId: string | null, selfId: string | null, today: string): Promise<FieldErrors> {
  if (!managerId) return {};
  if (managerId === selfId) return { reporting_manager_id: 'An employee cannot report to themselves.' };
  const m = await q.query<{ id: string; last_working_day: string | null }>(`select id, last_working_day from employees where id = $1`, [managerId]);
  if (!m[0]) return { reporting_manager_id: 'Pick a valid manager.' };
  if (m[0].last_working_day && m[0].last_working_day < today) return { reporting_manager_id: 'The chosen manager has exited.' };
  if (selfId) {
    // R-EMP-09 (friendly message; the DB trigger enforces it too)
    const loop = await q.query<{ found: boolean }>(
      `with recursive chain(id, depth) as (select $1::uuid, 1 union all
         select e.reporting_manager_id, c.depth + 1 from employees e join chain c on e.id = c.id where e.reporting_manager_id is not null and c.depth < 100)
       select exists(select 1 from chain where id = $2::uuid) as found`, [managerId, selfId]);
    if (loop[0]?.found) return { reporting_manager_id: 'This would create a reporting loop: the chosen manager already reports to this employee.' };
  }
  return {};
}

/** E1: HR creates an employee; code generated by the DB sequence (R-EMP-08). */
export async function createEmployee(actor: Actor, input: EmployeeFormInput): Promise<{ id: string; employee_code: string }> {
  requireHr(actor);
  const v = validateEmployee(input);
  if (!v.ok) throw new ValidationError('Please fix the highlighted fields.', v.errors as Record<string, string>);
  const e = v.value as Required<typeof v.value>;
  const today = todayIST();
  try {
    return await getDb().tx(async (q) => {
      const mErr = await checkManager(q, e.reporting_manager_id, null, today);
      if (Object.keys(mErr).length) throw new ValidationError('Please fix the highlighted fields.', mErr as Record<string, string>);
      const rows = await q.query<{ id: string; employee_code: string }>(
        `insert into employees (email, full_name, mobile, dob, gender, date_of_joining, designation, department_id, location_id,
           reporting_manager_id, salary_grade, is_hr_admin, address_line1, address_line2, city, state, pincode,
           emergency_contact_name, emergency_contact_relation, emergency_contact_phone)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         returning id, employee_code`,
        [e.email, e.full_name, e.mobile, e.dob, e.gender, e.date_of_joining, e.designation, e.department_id, e.location_id,
          e.reporting_manager_id, e.salary_grade, Boolean(e.is_hr_admin), e.address_line1, e.address_line2 ?? '', e.city, e.state, e.pincode,
          e.emergency_contact_name, e.emergency_contact_relation, e.emergency_contact_phone]);
      const { id, employee_code } = rows[0];
      await q.query(`insert into employee_statutory (employee_id, pan, aadhaar, uan) values ($1,$2,$3,$4)`, [id, e.pan, e.aadhaar, e.uan]);
      await q.query(`insert into employee_bank (employee_id, account_number, ifsc, bank_name, account_holder_name) values ($1,$2,$3,$4,$5)`,
        [id, e.account_number, e.ifsc, e.bank_name, e.account_holder_name]);
      // Balance rows for the joining year (opening 0; accrual is calculated)
      const year = Math.max(yearOf(today), yearOf(e.date_of_joining));
      for (const t of await getLeaveTypes(q, { activeOnly: true })) {
        await q.query(`insert into leave_balances (employee_id, leave_type_id, year) values ($1,$2,$3) on conflict do nothing`, [id, t.id, year]);
      }
      await writeAudit(q, actor.id, [{ tableName: 'employees', recordId: id, subjectEmployeeId: id, action: 'CREATE', newValue: `${employee_code} ${e.full_name}` }]);
      return { id, employee_code };
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    mapDbError(err);
  }
}

const JOB_FIELDS = ['designation', 'department_id', 'location_id', 'reporting_manager_id', 'salary_grade', 'date_of_joining', 'is_hr_admin'] as const;
const PERSONAL_FIELDS = ['full_name', 'email', 'mobile', 'dob', 'gender', 'address_line1', 'address_line2', 'city', 'state', 'pincode',
  'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone'] as const;
const CONTACT_FIELDS = ['mobile', 'address_line1', 'address_line2', 'city', 'state', 'pincode', 'emergency_contact_name', 'emergency_contact_relation', 'emergency_contact_phone'] as const;

async function readable(q: Queryable, field: string, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  if (field === 'department_id') return (await q.query<{ n: string }>(`select name as n from departments where id = $1`, [value]))[0]?.n ?? String(value);
  if (field === 'location_id') return (await q.query<{ n: string }>(`select name as n from locations where id = $1`, [value]))[0]?.n ?? String(value);
  if (field === 'reporting_manager_id') return (await q.query<{ n: string }>(`select employee_code || ' ' || full_name as n from employees where id = $1`, [value]))[0]?.n ?? String(value);
  return String(value);
}

/**
 * HR edit (job + personal + optional new statutory/bank values; blank statutory fields = unchanged).
 * Every changed field is audited with old and new value (E8); statutory values masked.
 */
export async function updateEmployee(actor: Actor, id: string, input: Partial<EmployeeFormInput>): Promise<void> {
  requireHr(actor);
  const clean: Partial<EmployeeFormInput> = {};
  for (const [k, val] of Object.entries(input)) {
    if (['pan', 'aadhaar', 'uan', 'account_number', 'ifsc', 'bank_name', 'account_holder_name'].includes(k) && (val === '' || val === undefined || val === null)) continue;
    (clean as Record<string, unknown>)[k] = val;
  }
  const v = validateEmployee(clean, { partial: true, requireStatutory: false });
  if (!v.ok) throw new ValidationError('Please fix the highlighted fields.', v.errors as Record<string, string>);
  const n = v.value;
  const today = todayIST();
  try {
    await getDb().tx(async (q) => {
      const cur = (await q.query<Record<string, unknown>>(`select * from employees where id = $1 for update`, [id]))[0];
      if (!cur) throw new NotFoundError();
      if (n.reporting_manager_id !== undefined) {
        const mErr = await checkManager(q, n.reporting_manager_id, id, today);
        if (Object.keys(mErr).length) throw new ValidationError('Please fix the highlighted fields.', mErr as Record<string, string>);
      }
      const dob = (n.dob ?? cur.dob) as string;
      const doj = (n.date_of_joining ?? cur.date_of_joining) as string;
      const ageErr = validateEmployee({ dob, date_of_joining: doj }, { partial: true, requireStatutory: false });
      if (!ageErr.ok) throw new ValidationError('Please fix the highlighted fields.', ageErr.errors as Record<string, string>);

      const audit: AuditEntry[] = [];
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const f of [...JOB_FIELDS, ...PERSONAL_FIELDS]) {
        const nv = (n as Record<string, unknown>)[f];
        if (nv === undefined) continue;
        const ov = cur[f];
        if (String(ov ?? '') === String(nv ?? '')) continue;
        params.push(nv);
        sets.push(`${f} = $${params.length}`);
        audit.push({ tableName: 'employees', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: f, oldValue: await readable(q, f, ov), newValue: await readable(q, f, nv) });
      }
      if (sets.length) await q.query(`update employees set ${sets.join(', ')} where id = $1`, params);

      // Statutory: compare in SQL so the full Aadhaar is never read into the app
      if (n.pan) {
        const r = await q.query<{ old: string }>(`select pan as old from employee_statutory where employee_id = $1`, [id]);
        if (r[0]?.old !== n.pan) {
          await q.query(`update employee_statutory set pan = $2, updated_at = now() where employee_id = $1`, [id, n.pan]);
          audit.push({ tableName: 'employee_statutory', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: 'pan', oldValue: r[0]?.old, newValue: n.pan });
        }
      }
      if (n.aadhaar) {
        const before = await q.query<{ last4: string }>(`select aadhaar_last4 as last4 from employee_statutory where employee_id = $1`, [id]);
        const changed = await q.query(`update employee_statutory set aadhaar = $2, updated_at = now() where employee_id = $1 and aadhaar is distinct from $2 returning employee_id`, [id, n.aadhaar]);
        if (changed.length) audit.push({ tableName: 'employee_statutory', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: 'aadhaar', oldValue: before[0]?.last4, newValue: n.aadhaar });
      }
      if (n.uan) {
        const r = await q.query<{ old: string | null }>(`select uan as old from employee_statutory where employee_id = $1`, [id]);
        if (r[0]?.old !== n.uan) {
          await q.query(`update employee_statutory set uan = $2, updated_at = now() where employee_id = $1`, [id, n.uan]);
          audit.push({ tableName: 'employee_statutory', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: 'uan', oldValue: r[0]?.old, newValue: n.uan });
        }
      }
      const bankChanges: [string, unknown][] = [];
      for (const f of ['account_number', 'ifsc', 'bank_name', 'account_holder_name'] as const) if (n[f]) bankChanges.push([f, n[f]]);
      if (bankChanges.length) {
        const cb = (await q.query<Record<string, string>>(`select account_last4, ifsc, bank_name, account_holder_name, (account_number = $2) as same_acct from employee_bank where employee_id = $1`, [id, n.account_number ?? null]))[0];
        for (const [f, val] of bankChanges) {
          if (f === 'account_number' && cb?.same_acct) continue;
          if (f !== 'account_number' && cb?.[f] === val) continue;
          await q.query(`update employee_bank set ${f} = $2, updated_at = now() where employee_id = $1`, [id, val]);
          audit.push({ tableName: 'employee_bank', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: f, oldValue: f === 'account_number' ? cb?.account_last4 : cb?.[f], newValue: String(val) });
        }
      }
      await writeAudit(q, actor.id, audit);
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
    mapDbError(err);
  }
}

/** E5: self-service contact edit. Job fields are ignored even if posted. */
export async function updateContact(actor: Actor, id: string, input: Partial<EmployeeFormInput>): Promise<void> {
  const prof = await getEmployeeProfile(actor, id);
  if (!canEditContact(actor, { id: prof.id, reportingManagerId: prof.reporting_manager_id })) throw new ForbiddenError();
  const picked: Partial<EmployeeFormInput> = {};
  for (const f of CONTACT_FIELDS) if (input[f] !== undefined) (picked as Record<string, unknown>)[f] = input[f];
  const v = validateEmployee(picked, { partial: true, requireStatutory: false });
  if (!v.ok) throw new ValidationError('Please fix the highlighted fields.', v.errors as Record<string, string>);
  await getDb().tx(async (q) => {
    const cur = (await q.query<Record<string, unknown>>(`select * from employees where id = $1 for update`, [id]))[0];
    const sets: string[] = []; const params: unknown[] = [id]; const audit: AuditEntry[] = [];
    for (const [f, nv] of Object.entries(v.value)) {
      if (String(cur[f] ?? '') === String(nv ?? '')) continue;
      params.push(nv); sets.push(`${f} = $${params.length}`);
      audit.push({ tableName: 'employees', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: f, oldValue: String(cur[f] ?? ''), newValue: String(nv ?? '') });
    }
    if (sets.length) await q.query(`update employees set ${sets.join(', ')} where id = $1`, params);
    await writeAudit(q, actor.id, audit);
  });
}

/** E6: deactivate = set last working day. Record is never deleted. */
export async function deactivateEmployee(actor: Actor, id: string, lastWorkingDay: string, reason: string): Promise<{ openReports: number }> {
  requireHr(actor);
  if (!isValidISODate(lastWorkingDay)) throw new ValidationError('Pick the last working day.');
  if (!reason || reason.trim().length < 3) throw new ValidationError('Give a reason (e.g. Resigned).');
  if (id === actor.id) throw new ValidationError('You cannot deactivate yourself.');
  try {
    return await getDb().tx(async (q) => {
      const cur = (await q.query<{ last_working_day: string | null; date_of_joining: string }>(`select last_working_day, date_of_joining from employees where id = $1 for update`, [id]))[0];
      if (!cur) throw new NotFoundError();
      await q.query(`update employees set last_working_day = $2 where id = $1`, [id, lastWorkingDay]);
      // Pending leave after the last day is cancelled automatically
      await q.query(`update leave_requests set status = 'CANCELLED', cancelled_at = now() where employee_id = $1 and status = 'PENDING' and from_date > $2`, [id, lastWorkingDay]);
      await writeAudit(q, actor.id, [{ tableName: 'employees', recordId: id, subjectEmployeeId: id, action: 'DEACTIVATE', field: 'last_working_day', oldValue: cur.last_working_day, newValue: lastWorkingDay, reason: reason.trim() }]);
      const r = await q.query<{ n: number }>(`select count(*)::int as n from employees where reporting_manager_id = $1 and (last_working_day is null or last_working_day > $2)`, [id, lastWorkingDay]);
      return { openReports: r[0].n };
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) throw err;
    mapDbError(err);
  }
}

export async function reactivateEmployee(actor: Actor, id: string, reason: string) {
  requireHr(actor);
  await getDb().tx(async (q) => {
    const cur = (await q.query<{ last_working_day: string | null }>(`select last_working_day from employees where id = $1 for update`, [id]))[0];
    if (!cur) throw new NotFoundError();
    await q.query(`update employees set last_working_day = null where id = $1`, [id]);
    await writeAudit(q, actor.id, [{ tableName: 'employees', recordId: id, subjectEmployeeId: id, action: 'UPDATE', field: 'last_working_day', oldValue: cur.last_working_day, newValue: null, reason }]);
  });
}

export type Option = { id: string | number; label: string };

export async function formOptions(actor: Actor): Promise<{ departments: Option[]; locations: Option[]; managers: Option[] }> {
  requireHr(actor);
  const q = getDb();
  const [departments, locations, managers] = await Promise.all([
    q.query<{ id: number; label: string }>(`select id, name as label from departments order by name`),
    q.query<{ id: number; label: string }>(`select id, name as label from locations order by id`),
    q.query<{ id: string; label: string }>(`select id, employee_code || ' · ' || full_name as label from employees e where ${ACTIVE} order by full_name`, [todayIST()]),
  ]);
  return { departments, locations, managers };
}

/** Directory CSV for HR, with statutory data MASKED (Privacy NFR). */
export async function directoryCsv(actor: Actor): Promise<string> {
  requireHr(actor);
  const rows = await getDb().query<EmployeeListRow & { pan: string; aadhaar_last4: string; uan: string | null; account_last4: string; ifsc: string }>(
    `select e.employee_code, e.full_name, e.email, e.designation, d.name as department_name, l.name as location_name,
            m.employee_code as manager_name, e.date_of_joining, e.last_working_day,
            s.pan, s.aadhaar_last4, s.uan, b.account_last4, b.ifsc
       from employees e join departments d on d.id = e.department_id join locations l on l.id = e.location_id
       left join employees m on m.id = e.reporting_manager_id
       left join employee_statutory s on s.employee_id = e.id left join employee_bank b on b.employee_id = e.id
      order by e.employee_code`);
  return toCsv(
    ['Employee code', 'Name', 'Email', 'Designation', 'Department', 'Location', 'Manager code', 'Date of joining', 'Last working day', 'PAN (masked)', 'Aadhaar (masked)', 'UAN (masked)', 'Bank account (masked)', 'IFSC'],
    rows.map((r) => [r.employee_code, r.full_name, r.email, r.designation, r.department_name, r.location_name, r.manager_name ?? '',
      r.date_of_joining, r.last_working_day ?? '', maskPan(r.pan), maskAadhaar(r.aadhaar_last4), maskUan(r.uan), maskAccount(r.account_last4), r.ifsc]));
}
