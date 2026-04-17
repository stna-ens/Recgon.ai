import { NextRequest, NextResponse } from 'next/server';
import { auth, handlers } from '@/auth';
import { getUserById, updateUser } from '@/lib/userStorage';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const savedState = cookieStore.get('github_connect_state')?.value;

  // If connect-state cookie is present, this is an account-linking flow.
  if (savedState) {
    return handleConnect(request, savedState, cookieStore);
  }

  // Otherwise delegate to NextAuth for sign-in.
  return handlers.GET(request);
}

export const POST = handlers.POST;

async function handleConnect(
  request: NextRequest,
  savedState: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const { protocol, host } = new URL(request.url);
  const baseUrl = `${protocol}//${host}`;

  cookieStore.delete('github_connect_state');

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/account?github=denied`);
  }

  if (savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET,
      code,
      redirect_uri: `${baseUrl}/api/auth/callback/github`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  const tokenData = await tokenRes.json() as { access_token?: string };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  let githubUsername: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
    });
    if (userRes.ok) {
      const githubUser = await userRes.json() as { login?: string; avatar_url?: string };
      githubUsername = githubUser.login;
      avatarUrl = githubUser.avatar_url;
    }
  } catch {
    // username/avatar are optional
  }

  await updateUser(user.id, { githubAccessToken: accessToken, githubUsername, avatarUrl });
  return NextResponse.redirect(`${baseUrl}/account?github=connected`);
}
