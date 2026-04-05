import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig, updateOAuthTokens, type OAuthTokens } from '@/lib/analyticsStorage';

export interface GAProperty {
  id: string;
  displayName: string;
  accountName: string;
}

async function getValidAccessToken(oauth: OAuthTokens, userId: string): Promise<string> {
  if (oauth.expiresAt > Date.now() + 5 * 60 * 1000) {
    return oauth.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: oauth.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error('Failed to refresh token. Please reconnect your Google account.');
  }

  const newTokens: Partial<OAuthTokens> = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  if (data.refresh_token) newTokens.refreshToken = data.refresh_token;
  await updateOAuthTokens(userId, newTokens);

  return data.access_token;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await getAnalyticsConfig(session.user.id);
  if (!config?.oauth) {
    return NextResponse.json({ error: 'OAuth not connected' }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(config.oauth, session.user.id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Token refresh failed' }, { status: 401 });
  }

  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { error?: { message?: string } })?.error?.message ?? 'Failed to fetch properties' },
      { status: res.status },
    );
  }

  const data = await res.json() as {
    accountSummaries?: {
      displayName?: string;
      propertySummaries?: { property?: string; displayName?: string }[];
    }[];
  };

  const properties: GAProperty[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      const id = (prop.property ?? '').replace('properties/', '');
      if (!id) continue;
      properties.push({
        id,
        displayName: prop.displayName ?? id,
        accountName: account.displayName ?? 'Unknown account',
      });
    }
  }

  return NextResponse.json(properties);
}
