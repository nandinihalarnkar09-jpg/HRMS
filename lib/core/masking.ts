/**
 * Masking (R-EMP-10). One implementation for screens, CSVs, audit log and emails.
 * Every function accepts null/undefined and returns '—'.
 */

/** ABCDE1234F → ABCDE****F */
export function maskPan(pan: string | null | undefined): string {
  if (!pan) return '—';
  const v = pan.toUpperCase();
  if (v.length !== 10) return '**********';
  return `${v.slice(0, 5)}****${v.slice(9)}`;
}

/**
 * Aadhaar → 'XXXX XXXX 1234'. Accepts the last 4 digits (what the app selects) or, defensively,
 * a full number, so a full number can never pass through unmasked.
 */
export function maskAadhaar(last4OrFull: string | null | undefined): string {
  if (!last4OrFull) return '—';
  const digits = last4OrFull.replace(/\D/g, '');
  return `XXXX XXXX ${digits.slice(-4).padStart(4, 'X')}`;
}

/** Bank account: last 4 only → 'XXXXXX1234'. */
export function maskAccount(last4OrFull: string | null | undefined): string {
  if (!last4OrFull) return '—';
  const digits = last4OrFull.replace(/\D/g, '');
  return `XXXXXX${digits.slice(-4)}`;
}

/** UAN 100912345678 → 1009****5678 */
export function maskUan(uan: string | null | undefined): string {
  if (!uan) return '—';
  if (uan.length !== 12) return '************';
  return `${uan.slice(0, 4)}****${uan.slice(8)}`;
}

/** Mask whatever sensitive field is being audited (statutory values are stored masked). */
export function maskForAudit(field: string, value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return value ?? null;
  switch (field) {
    case 'pan': return maskPan(value);
    case 'aadhaar': return maskAadhaar(value);
    case 'uan': return maskUan(value);
    case 'account_number': return maskAccount(value);
    default: return value;
  }
}

export const SENSITIVE_FIELDS = ['pan', 'aadhaar', 'uan', 'account_number'] as const;
