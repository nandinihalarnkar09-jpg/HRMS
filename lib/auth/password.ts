/**
 * Password hashing and cookie signing for the local (offline) sign-in. Node crypto only.
 * scrypt with a random 16-byte salt; constant-time comparison.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Default password for a seeded employee: "<firstname>@KCF2026", e.g. priya@KCF2026 */
export function defaultPassword(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  return `${first}@KCF2026`;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString();

/** Signed session token: base64url(email).expiryMs.hmac */
export function signSession(email: string, secret: string, ttlHours = 12, now = Date.now()): string {
  const body = `${b64(email.toLowerCase())}.${now + ttlHours * 3_600_000}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailB64, exp, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${emailB64}.${exp}`).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!(Number(exp) > now)) return null;
  return unb64(emailB64);
}
