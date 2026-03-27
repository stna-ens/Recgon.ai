import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

// GET: Generate the OAuth consent URL and redirect the user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.' }, { status: 500 });
  }

  const redirectUri = new URL('/api/analytics/oauth/callback', req.nextUrl.origin).toString();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: session.user.id,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
