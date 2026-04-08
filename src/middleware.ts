import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isPublicPage = pathname === '/landing' || pathname.startsWith('/.well-known/');
  const isApiRoute = pathname.startsWith('/api/');
  const isTeamSetup = pathname === '/teams/setup' || pathname.startsWith('/teams/invite/');
  // MCP OAuth endpoints — auth is handled inside the route handlers themselves
  const isMcpRoute = pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');

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
  matcher: ['/((?!api/auth|api/github/connect/callback|_next/static|_next/image|favicon.ico).*)'],
};
