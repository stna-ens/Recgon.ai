import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

interface OAuthState {
  userId: string;
  scope: 'personal' | 'team';
  teamId?: string;
}

function encodeState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

// GET: Generate the OAuth consent URL and redirect the user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.' }, { status: 500 });
  }

  const scopeParam = req.nextUrl.searchParams.get('scope') === 'team' ? 'team' : 'personal';
  const teamId = req.nextUrl.searchParams.get('teamId') ?? undefined;

  if (scopeParam === 'team') {
    if (!teamId) return NextResponse.json({ error: 'teamId is required for team scope' }, { status: 400 });
    const role = await verifyTeamAccess(teamId, session.user.id);
    if (role !== 'owner') return NextResponse.json({ error: 'Only team owners can connect team analytics' }, { status: 403 });
  }

  const redirectUri = new URL('/api/analytics/oauth/callback', req.nextUrl.origin).toString();

  const state = encodeState({
    userId: session.user.id,
    scope: scopeParam,
    teamId: scopeParam === 'team' ? teamId : undefined,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
