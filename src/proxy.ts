import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

// Methods that mutate state — require a same-origin request to defend against CSRF.
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isSameOrigin(req: { headers: Headers; nextUrl: URL }): boolean {
  // Modern browsers send Sec-Fetch-Site on every request — prefer that.
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';

  // Fall back to comparing Origin against the host. If neither is present,
  // it's almost certainly not a browser → allow (e.g. server-side fetch, MCP).
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function isMobileUA(req: { headers: Headers }): boolean {
  const ua = req.headers.get('user-agent') ?? '';
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isPublicPage = pathname === '/landing' || pathname.startsWith('/.well-known/');
  const isApiRoute = pathname.startsWith('/api/');

  // Block mobile users from accessing the app — redirect to landing page.
  if (isMobileUA(req) && !isPublicPage && !isApiRoute && pathname !== '/' && pathname !== '/mentor') {
    return NextResponse.redirect(new URL('/landing', req.url));
  }
  const isTeamSetup = pathname === '/teams/setup' || pathname.startsWith('/teams/invite/');
  // MCP OAuth endpoints — auth is handled inside the route handlers themselves
  const isMcpRoute =
    pathname === '/mcp' ||
    pathname === '/api/mcp' ||
    pathname.startsWith('/api/mcp/');
  // NextAuth handles its own CSRF — don't double-gate.
  const isNextAuthRoute = pathname.startsWith('/api/auth/');

  // CSRF check: state-changing API calls must come from same origin.
  if (isApiRoute && !isMcpRoute && !isNextAuthRoute && CSRF_METHODS.has(req.method)) {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 });
    }
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (isMcpRoute) {
    return NextResponse.next();
  }

  if (!isLoggedIn && !isAuthPage && !isPublicPage) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/landing', req.url));
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // If logged in but on a non-API, non-auth, non-team-setup page,
  // check if user has teams. This is handled client-side by TeamProvider
  // redirecting to /teams/setup when teams array is empty.
  // The middleware just ensures /teams/setup is accessible.
  if (isLoggedIn && isTeamSetup) {
    return NextResponse.next();
  }
});

export const config = {
  matcher: [
    '/((?!api/auth|api/github/connect/callback|_next/static|_next/image|favicon.ico|favicon.svg|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)',
  ],
};
