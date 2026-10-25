/**
 * Strip identifiers from text BEFORE it reaches the AI model (agent guardrail, ARCHITECTURE §6.2).
 * Aadhaar (12 digits, optionally spaced), PAN, and bank-account-like numbers (9–18 digits).
 */
export function redactPii(text: string): string {
  return text
    // Aadhaar with spaces/dashes: 1234 5678 9012
    .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[redacted]')
    // PAN
    .replace(/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g, '[redacted]')
    // IFSC
    .replace(/\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g, '[redacted]')
    // Any 9–18 digit run (Aadhaar, UAN, account numbers). Mobile numbers (10 digits) are also
    // personal data, so they go too.
    .replace(/\b\d{9,18}\b/g, '[redacted]');
}

/** True if a string looks like it contains a full sensitive identifier. Used to check tool output. */
export function containsSensitiveId(text: string): boolean {
  return redactPii(text) !== text;
}
