import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isPublicPage = pathname === '/landing';
  const isApiRoute = pathname.startsWith('/api/');

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url));
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
});

export const config = {
  matcher: ['/((?!api/auth|api/github/connect/callback|_next/static|_next/image|favicon.ico).*)'],
};
