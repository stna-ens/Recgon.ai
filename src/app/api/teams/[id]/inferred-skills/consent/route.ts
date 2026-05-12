// Phase 2 / Plan 02-03 / SKILL-01.
//
// POST /api/teams/[id]/inferred-skills/consent
//   Builds a GitHub OAuth authorization URL with elevated `repo` scope, sets
//   a separate `github_skill_mining_state` cookie (T-02-14: keeps the consent
//   flow from silently piggybacking on the existing `github_connect_state`
//   project-import flow), and returns it. The client does
//   `window.location.assign(redirectUrl)`; GitHub redirects to
//   `/api/auth/callback/github` which detects the skill-mining cookie and
//   writes `teammate_profiles.github_mining_consent_at`.
//
// DELETE /api/teams/[id]/inferred-skills/consent
//   Unsets `teammate_profiles.github_mining_consent_at` for (teamId, userId).
//   Per D-22, does NOT touch teammate_inferred_skills rows — accepted and
//   rejected pills survive Stop-mining. GitHub scope revocation is a deferred
//   follow-up; clearing the timestamp is enough to gate the worker.
//
// AUTHORIZATION:
//   session + verifyTeamAccess (404 not 403 on team mismatch).

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { clearMiningConsent } from '@/lib/recgon/inferredSkillsStorage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 10 minutes — covers GitHub's OAuth UI without leaving the cookie sitting
// in the browser any longer than necessary.
const STATE_COOKIE_MAX_AGE_S = 60 * 10;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id: teamId } = await params;

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role === null) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }

  try {
    // Encode teamId in state so the callback can find the row to update
    // without trusting the URL path (callback runs at /api/auth/callback/github,
    // a global route — no teamId in its params).
    const randomToken = crypto.randomBytes(16).toString('hex');
    const state = `${randomToken}.${teamId}`;

    const cookieStore = await cookies();
    cookieStore.set('github_skill_mining_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: STATE_COOKIE_MAX_AGE_S,
    });

    const { protocol, host } = new URL(req.url);
    const baseUrl = `${protocol}//${host}`;
    const clientId =
      process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || '';
    const redirectUri = `${baseUrl}/api/auth/callback/github`;
    const scope = 'read:user user:email repo';
    const redirectUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ ok: true, redirectUrl });
  } catch (error) {
    logger.error('inferred-skills consent POST failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to build consent URL' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id: teamId } = await params;

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role === null) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }

  try {
    await clearMiningConsent(teamId, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('inferred-skills consent DELETE failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to revoke consent' },
      { status: 500 },
    );
  }
}
