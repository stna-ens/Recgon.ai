import { NextRequest, NextResponse } from 'next/server';
import { setAnalyticsOAuth } from '@/lib/analyticsStorage';
import { logger } from '@/lib/logger';

// Google redirects here after the user consents
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code || !userId) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_denied', req.nextUrl.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_not_configured', req.nextUrl.origin));
  }

  const redirectUri = new URL('/api/analytics/oauth/callback', req.nextUrl.origin).toString();

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.access_token) {
      logger.error('oauth token exchange failed', { status: tokenRes.status });
      return NextResponse.redirect(new URL('/analytics?error=token_exchange_failed', req.nextUrl.origin));
    }

    await setAnalyticsOAuth(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });

    return NextResponse.redirect(new URL('/analytics?connected=true', req.nextUrl.origin));
  } catch (err) {
    console.error('[OAuth callback] Error:', err);
    return NextResponse.redirect(new URL('/analytics?error=oauth_failed', req.nextUrl.origin));
  }
}
