/**
 * Local-only "pick a test user" login (decision D-10). It can never be enabled in production:
 * NODE_ENV=production (next build/start, Vercel) or the VERCEL env var disables it.
 */
export const DEV_COOKIE = 'lehar_dev_user';

export function isDevAuth(): boolean {
  return process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
}
