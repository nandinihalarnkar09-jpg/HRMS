/**
 * Indian field validation (R-EMP-01 … R-EMP-07).
 * The same regexes are enforced by CHECK constraints in db/migrations/001_schema.sql.
 */
import { addDays, isValidISODate, type ISODate } from './dates';

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const AADHAAR_RE = /^[2-9][0-9]{11}$/; // UIDAI never issues numbers starting 0 or 1 (rule D2)
export const UAN_RE = /^[0-9]{12}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const MOBILE_RE = /^[6-9][0-9]{9}$/;
export const PIN_RE = /^[1-9][0-9]{5}$/;
export const ACCOUNT_RE = /^[0-9]{9,18}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union territories
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

export const GENDERS = ['Female', 'Male', 'Other'] as const;

/** Normalisers: what the user types → what we store. */
export const normalise = {
  pan: (v: string) => v.replace(/\s+/g, '').toUpperCase(),
  aadhaar: (v: string) => v.replace(/[\s-]+/g, ''),
  uan: (v: string) => v.replace(/[\s-]+/g, ''),
  ifsc: (v: string) => v.replace(/\s+/g, '').toUpperCase(),
  mobile: (v: string) => v.replace(/[\s-]+/g, '').replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ''),
  pincode: (v: string) => v.replace(/\s+/g, ''),
  account: (v: string) => v.replace(/[\s-]+/g, ''),
  email: (v: string) => v.trim().toLowerCase(),
};

export function validatePan(raw: string): string | null {
  const v = normalise.pan(raw);
  if (!v) return 'PAN is required.';
  if (!PAN_RE.test(v)) return 'PAN must be 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).';
  return null;
}

export function validateAadhaar(raw: string): string | null {
  const v = normalise.aadhaar(raw);
  if (!v) return 'Aadhaar is required.';
  if (!AADHAAR_RE.test(v)) return 'Aadhaar must be exactly 12 digits and cannot start with 0 or 1.';
  return null;
}

export function validateUan(raw: string | null | undefined): string | null {
  const v = normalise.uan(raw ?? '');
  if (!v) return null; // optional for new joiners (R-EMP-03)
  if (!UAN_RE.test(v)) return 'UAN must be exactly 12 digits (leave blank for a new joiner without one).';
  return null;
}

export function validateIfsc(raw: string): string | null {
  const v = normalise.ifsc(raw);
  if (!v) return 'IFSC is required.';
  if (!IFSC_RE.test(v)) return 'IFSC must be 11 characters: 4 letters, then 0, then 6 letters or digits (e.g. SBIN0001234).';
  return null;
}

export function validateMobile(raw: string, label = 'Mobile'): string | null {
  const v = normalise.mobile(raw);
  if (!v) return `${label} is required.`;
  if (!MOBILE_RE.test(v)) return `${label} must be 10 digits starting with 6, 7, 8 or 9.`;
  return null;
}

export function validatePincode(raw: string): string | null {
  const v = normalise.pincode(raw);
  if (!v) return 'PIN code is required.';
  if (!PIN_RE.test(v)) return 'PIN code must be 6 digits and cannot start with 0.';
  return null;
}

export function validateState(v: string): string | null {
  return (INDIAN_STATES_AND_UTS as readonly string[]).includes(v) ? null : 'Pick a state or union territory from the list.';
}

export function validateAccount(raw: string): string | null {
  const v = normalise.account(raw);
  if (!v) return 'Account number is required.';
  if (!ACCOUNT_RE.test(v)) return 'Account number must be 9 to 18 digits.';
  return null;
}

export function validateEmail(raw: string): string | null {
  const v = normalise.email(raw);
  if (!v) return 'Email is required.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return null;
}

/** Date the person turns `years` old (handles 29 Feb → 28 Feb/1 Mar consistently via UTC). */
export function dateAtAge(dob: ISODate, years: number): ISODate {
  const [y, m, d] = dob.split('-').map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d));
  // 29 Feb + 18y in a non-leap year rolls to 1 Mar, which is the legally safer reading.
  return target.toISOString().slice(0, 10);
}

/** R-EMP-07: at least 18 on the date of joining. */
export function validateAgeOnJoining(dob: string, doj: string): string | null {
  if (!isValidISODate(dob)) return 'Date of birth is required.';
  if (!isValidISODate(doj)) return 'Date of joining is required.';
  if (dateAtAge(dob, 18) > doj) return 'Employee must be at least 18 years old on the date of joining.';
  return null;
}

export type EmployeeFormInput = {
  full_name: string; email: string; mobile: string; dob: string; gender: string;
  address_line1: string; address_line2?: string; city: string; state: string; pincode: string;
  date_of_joining: string; designation: string; department_id: string | number;
  location_id: string | number; reporting_manager_id?: string | null; salary_grade: string;
  is_hr_admin?: boolean;
  pan: string; aadhaar: string; uan?: string | null;
  account_number: string; ifsc: string; bank_name: string; account_holder_name: string;
  emergency_contact_name: string; emergency_contact_relation: string; emergency_contact_phone: string;
};

export type FieldErrors = Partial<Record<keyof EmployeeFormInput | 'form', string>>;

export type NormalisedEmployee = Omit<EmployeeFormInput, 'department_id' | 'location_id' | 'uan' | 'reporting_manager_id'> & {
  department_id: number; location_id: number; uan: string | null; reporting_manager_id: string | null;
};

/**
 * Validate a full employee form (create). For updates, pass `partial = true` to validate only
 * fields that are present.
 */
export function validateEmployee(
  input: Partial<EmployeeFormInput>,
  opts: { partial?: boolean; requireStatutory?: boolean } = {},
): { ok: true; value: Partial<NormalisedEmployee> } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const has = (k: keyof EmployeeFormInput) => !opts.partial || input[k] !== undefined;
  const s = (k: keyof EmployeeFormInput) => String(input[k] ?? '').trim();
  const out: Partial<NormalisedEmployee> = {};

  if (has('full_name')) {
    if (s('full_name').length < 2) errors.full_name = 'Full name is required.';
    else out.full_name = s('full_name');
  }
  if (has('email')) {
    const e = validateEmail(s('email')); if (e) errors.email = e; else out.email = normalise.email(s('email'));
  }
  if (has('mobile')) {
    const e = validateMobile(s('mobile')); if (e) errors.mobile = e; else out.mobile = normalise.mobile(s('mobile'));
  }
  if (has('gender')) {
    if (!(GENDERS as readonly string[]).includes(s('gender'))) errors.gender = 'Select a gender.';
    else out.gender = s('gender');
  }
  if (has('dob')) {
    if (!isValidISODate(s('dob'))) errors.dob = 'Date of birth is required.'; else out.dob = s('dob');
  }
  if (has('date_of_joining')) {
    if (!isValidISODate(s('date_of_joining'))) errors.date_of_joining = 'Date of joining is required.';
    else out.date_of_joining = s('date_of_joining');
  }
  if (out.dob && out.date_of_joining) {
    const e = validateAgeOnJoining(out.dob, out.date_of_joining);
    if (e) errors.dob = e;
  }
  if (has('address_line1')) {
    if (s('address_line1').length < 3) errors.address_line1 = 'Address is required.'; else out.address_line1 = s('address_line1');
  }
  if (has('address_line2')) out.address_line2 = s('address_line2');
  if (has('city')) { if (!s('city')) errors.city = 'City is required.'; else out.city = s('city'); }
  if (has('state')) { const e = validateState(s('state')); if (e) errors.state = e; else out.state = s('state'); }
  if (has('pincode')) { const e = validatePincode(s('pincode')); if (e) errors.pincode = e; else out.pincode = normalise.pincode(s('pincode')); }
  if (has('designation')) { if (!s('designation')) errors.designation = 'Designation is required.'; else out.designation = s('designation'); }
  if (has('department_id')) {
    const n = Number(input.department_id); if (!Number.isInteger(n) || n <= 0) errors.department_id = 'Select a department.'; else out.department_id = n;
  }
  if (has('location_id')) {
    const n = Number(input.location_id); if (!Number.isInteger(n) || n <= 0) errors.location_id = 'Select a location.'; else out.location_id = n;
  }
  if (has('reporting_manager_id')) out.reporting_manager_id = s('reporting_manager_id') || null;
  if (has('salary_grade')) { if (!s('salary_grade')) errors.salary_grade = 'Salary grade is required.'; else out.salary_grade = s('salary_grade'); }
  if (input.is_hr_admin !== undefined) out.is_hr_admin = Boolean(input.is_hr_admin);

  const statutory = opts.requireStatutory ?? !opts.partial;
  if (statutory || input.pan !== undefined) { const e = validatePan(s('pan')); if (e) errors.pan = e; else out.pan = normalise.pan(s('pan')); }
  if (statutory || input.aadhaar !== undefined) { const e = validateAadhaar(s('aadhaar')); if (e) errors.aadhaar = e; else out.aadhaar = normalise.aadhaar(s('aadhaar')); }
  if (statutory || input.uan !== undefined) { const e = validateUan(s('uan')); if (e) errors.uan = e; else out.uan = normalise.uan(s('uan')) || null; }
  if (statutory || input.account_number !== undefined) { const e = validateAccount(s('account_number')); if (e) errors.account_number = e; else out.account_number = normalise.account(s('account_number')); }
  if (statutory || input.ifsc !== undefined) { const e = validateIfsc(s('ifsc')); if (e) errors.ifsc = e; else out.ifsc = normalise.ifsc(s('ifsc')); }
  if (statutory || input.bank_name !== undefined) { if (!s('bank_name')) errors.bank_name = 'Bank name is required.'; else out.bank_name = s('bank_name'); }
  if (statutory || input.account_holder_name !== undefined) { if (!s('account_holder_name')) errors.account_holder_name = 'Account holder name is required.'; else out.account_holder_name = s('account_holder_name'); }

  if (has('emergency_contact_name')) { if (!s('emergency_contact_name')) errors.emergency_contact_name = 'Emergency contact name is required.'; else out.emergency_contact_name = s('emergency_contact_name'); }
  if (has('emergency_contact_relation')) { if (!s('emergency_contact_relation')) errors.emergency_contact_relation = 'Relation is required.'; else out.emergency_contact_relation = s('emergency_contact_relation'); }
  if (has('emergency_contact_phone')) {
    const e = validateMobile(s('emergency_contact_phone'), 'Emergency contact phone');
    if (e) errors.emergency_contact_phone = e; else out.emergency_contact_phone = normalise.mobile(s('emergency_contact_phone'));
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: out };
}

/** Clamp a "N days ago" check (R-LV-09). */
export function isTooFarInPast(from: ISODate, today: ISODate, maxDays = 30): boolean {
  return from < addDays(today, -maxDays);
}
