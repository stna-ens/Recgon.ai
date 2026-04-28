import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { setAnalyticsOAuth, type ConfigScope } from '@/lib/analyticsStorage';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { logger } from '@/lib/logger';

interface OAuthState {
  userId: string;
  scope: 'personal' | 'team';
  teamId?: string;
}

function decodeState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<OAuthState>;
    if (!parsed?.userId || (parsed.scope !== 'personal' && parsed.scope !== 'team')) return null;
    if (parsed.scope === 'team' && !parsed.teamId) return null;
    return parsed as OAuthState;
  } catch {
    return null;
  }
}

// Google redirects here after the user consents
export async function GET(req: NextRequest) {
  const session = await auth();
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code || !stateParam) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_denied', req.nextUrl.origin));
  }

  const state = decodeState(stateParam);
  if (!state) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_state_invalid', req.nextUrl.origin));
  }

  if (!session?.user?.id || session.user.id !== state.userId) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_session_mismatch', req.nextUrl.origin));
  }

  if (state.scope === 'team') {
    const role = await verifyTeamAccess(state.teamId!, session.user.id);
    if (role !== 'owner') {
      return NextResponse.redirect(new URL('/analytics?error=oauth_forbidden', req.nextUrl.origin));
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/analytics?error=oauth_not_configured', req.nextUrl.origin));
  }

  const redirectUri = new URL('/api/analytics/oauth/callback', req.nextUrl.origin).toString();

  try {
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

    const configScope: ConfigScope = state.scope === 'team'
      ? { kind: 'team', teamId: state.teamId! }
      : { kind: 'personal', userId: state.userId };

    await setAnalyticsOAuth(configScope, state.userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    });

    const redirectUrl = new URL('/analytics', req.nextUrl.origin);
    redirectUrl.searchParams.set('connected', state.scope);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error('[OAuth callback] Error:', err);
    return NextResponse.redirect(new URL('/analytics?error=oauth_failed', req.nextUrl.origin));
  }
}
