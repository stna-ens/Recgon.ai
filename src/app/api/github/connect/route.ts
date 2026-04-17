import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById, updateUser } from '@/lib/userStorage';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('github_connect_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  const { protocol, host } = new URL(request.url);
  const redirectUri = `${protocol}//${host}/api/auth/callback/github`;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user user:email repo',
    state,
    redirect_uri: redirectUri,
  });

  return NextResponse.redirect(`https://github.com/login/oauth/authorize?${params}`);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserById(session.user.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.githubAccessToken) {
    const clientId = process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (clientId && clientSecret) {
      await fetch(`https://api.github.com/applications/${clientId}/token`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ access_token: user.githubAccessToken }),
      }).catch(() => {});
    }
  }

  await updateUser(user.id, { githubAccessToken: undefined, githubUsername: undefined });
  return NextResponse.json({ success: true });
}
