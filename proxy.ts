/**
 * CHECK 1 (ARCHITECTURE §2): must be signed in for every non-public route.
 * Next.js 16 uses proxy.ts (formerly middleware.ts). Role checks happen later, on the server,
 * in getActor() and the services; this only checks that a session exists.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';

const isPublic = createRouteMatcher(['/sign-in(.*)', '/access-denied', '/dev-login']);

let clerk: ReturnType<typeof clerkMiddleware> | null = null;

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isDevAuth()) {
    if (!isPublic(req) && !req.cookies.get(DEV_COOKIE)) {
      if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
      return NextResponse.redirect(new URL('/dev-login', req.url));
    }
    return NextResponse.next();
  }
  clerk ??= clerkMiddleware(async (auth, request) => {
    if (!isPublic(request)) await auth.protect();
  });
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
