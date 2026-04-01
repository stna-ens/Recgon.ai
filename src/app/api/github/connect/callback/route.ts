import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserById, updateUser } from '@/lib/userStorage';
import { cookies } from 'next/headers';

function getBaseUrl(request: NextRequest) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = getBaseUrl(request);

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/account?github=denied`);
  }

  // Verify CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('github_connect_state')?.value;
  cookieStore.delete('github_connect_state');

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  // Get the current session — cookie is still valid since this is same browser
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_ID,
      client_secret: process.env.GITHUB_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token as string | undefined;

  if (!accessToken) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  // Fetch GitHub username and avatar
  let githubUsername: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (userRes.ok) {
      const githubUser = await userRes.json();
      githubUsername = githubUser.login as string;
      avatarUrl = githubUser.avatar_url as string;
    }
  } catch {
    // username/avatar are optional, proceed without them
  }

  await updateUser(user.id, { githubAccessToken: accessToken, githubUsername, avatarUrl });

  return NextResponse.redirect(`${baseUrl}/account?github=connected`);
}
