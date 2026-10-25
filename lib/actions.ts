import 'server-only';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/core/authz';

/** Standard result for server actions used with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: unknown;
};

/**
 * Turns domain errors into a friendly state. getActor() must be called BEFORE this (outside),
 * because redirects are thrown and must not be swallowed.
 */
export async function toState(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof NotFoundError) return { ok: false, error: 'Not found.' };
    console.error(e);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

export function str(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
}
