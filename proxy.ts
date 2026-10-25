/**
 * CHECK 1 (ARCHITECTURE §2): must be signed in for every non-public route.
 * Next.js 16 uses proxy.ts (formerly middleware.ts). Role checks happen later, on the server,
 * in getActor() and the services; this only checks that a session exists.
 * Signed-out visitors to "/" see the public start page (/welcome).
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from 'next/server';
import { DEV_COOKIE, isDevAuth } from '@/lib/auth/dev';

const isPublic = createRouteMatcher(['/welcome', '/sign-in(.*)', '/access-denied']);

let clerk: NextMiddleware | null = null;

function signedOut(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.redirect(new URL(req.nextUrl.pathname === '/' ? '/welcome' : '/sign-in', req.url));
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isDevAuth()) {
    // The cookie's signature and expiry are verified on the server in getActor()
    if (!isPublic(req) && !req.cookies.get(DEV_COOKIE)) return signedOut(req);
    return NextResponse.next();
  }
  if (!clerk) {
    clerk = clerkMiddleware(async (auth, request) => {
      if (isPublic(request)) return;
      const { userId } = await auth();
      if (!userId) return signedOut(request as NextRequest);
    }) as unknown as NextMiddleware;
  }
  return clerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
