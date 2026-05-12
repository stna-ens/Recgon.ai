import { NextRequest, NextResponse } from 'next/server';
import { auth, handlers } from '@/auth';
import { getUserById, updateUser } from '@/lib/userStorage';
import { setMiningConsent } from '@/lib/recgon/inferredSkillsStorage';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  // Phase 2 / Plan 02-03 — skill-mining consent variant. The state cookie name
  // is intentionally distinct from `github_connect_state` (T-02-14) so this
  // flow never silently piggybacks on a normal project-import OAuth.
  const skillMiningState = cookieStore.get('github_skill_mining_state')?.value;
  if (skillMiningState) {
    return handleSkillMiningConsent(request, skillMiningState, cookieStore);
  }

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

// Phase 2 / Plan 02-03 / SKILL-01. The skill-mining consent variant of the
// GitHub OAuth callback. Distinct cookie (`github_skill_mining_state`) and
// redirect destination from the existing project-import handler. Exchanges
// the code for a token (with elevated `repo` scope from the consent route),
// persists the token + username via `updateUser`, and writes
// `teammate_profiles.github_mining_consent_at = now()` for (teamId, userId).
//
// The teamId is embedded in `state` as `${randomToken}.${teamId}` by
// /api/teams/[id]/inferred-skills/consent. Cookie comparison verifies the
// random token portion (T-02-14 CSRF).
async function handleSkillMiningConsent(
  request: NextRequest,
  savedState: string,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const { protocol, host } = new URL(request.url);
  const baseUrl = `${protocol}//${host}`;

  // Cookie is one-shot — always clear, even on failure.
  cookieStore.delete('github_skill_mining_state');

  // Decode teamId from the saved state (defensive: pull from cookie value,
  // not the URL — that way a leaked state in the URL can't redirect us to
  // an attacker-controlled teamId).
  const teamId = savedState.split('.')[1] ?? '';
  const failedRedirect = teamId
    ? `${baseUrl}/teams/${teamId}/me?github_skill_mining=failed`
    : `${baseUrl}/account?github=error`;

  if (errorParam || !code || !state) {
    return NextResponse.redirect(failedRedirect);
  }
  if (savedState !== state) {
    return NextResponse.redirect(failedRedirect);
  }
  if (!teamId) {
    return NextResponse.redirect(`${baseUrl}/account?github=error`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.redirect(failedRedirect);
  }

  // Exchange the code for the elevated-scope token.
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID,
      client_secret:
        process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET,
      code,
      redirect_uri: `${baseUrl}/api/auth/callback/github`,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(failedRedirect);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(failedRedirect);
  }

  // Best-effort enrichment (username + avatar). Mirrors handleConnect.
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
      const ghUser = (await userRes.json()) as {
        login?: string;
        avatar_url?: string;
      };
      githubUsername = ghUser.login;
      avatarUrl = ghUser.avatar_url;
    }
  } catch {
    // username/avatar are optional
  }

  try {
    await updateUser(user.id, {
      githubAccessToken: accessToken,
      githubUsername,
      avatarUrl,
    });
    await setMiningConsent(teamId, session.user.id);
  } catch (err) {
    logger.error('skill-mining consent persistence failed', {
      teamId,
      userId: session.user.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(failedRedirect);
  }

  return NextResponse.redirect(
    `${baseUrl}/teams/${teamId}/me?github_skill_mining=connected`,
  );
}
