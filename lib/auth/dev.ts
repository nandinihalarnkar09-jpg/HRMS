/**
 * Email + password sign-in against local_logins (decisions D-10, D-17, D-19).
 *  - AUTH_MODE=dev:      offline/local only; refused when NODE_ENV=production or on Vercel.
 *  - AUTH_MODE=password: the public DEMO deployment (fictional seed data, published demo passwords).
 *                        Allowed in production on purpose. A real company deployment leaves
 *                        AUTH_MODE unset and uses Clerk.
 */
export const DEV_COOKIE = 'lehar_dev_user';

export function isDemoPasswordAuth(): boolean {
  return process.env.AUTH_MODE === 'password';
}

export function isDevAuth(): boolean {
  if (isDemoPasswordAuth()) return true;
  return process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
}
