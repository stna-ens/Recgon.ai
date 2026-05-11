// POST + GET handlers for the teammate self-declared profile.
// Phase 1 / Plan 01-03.
//
// AUTHORIZATION (Pitfall 6 / D-17..D-20 — IDOR threat T-03-01):
// - POST writes ONLY the logged-in user's own profile. No `target_user_id`
//   parameter is accepted (D-19 — owner does NOT edit teammate profiles
//   here; that's deferred).
// - GET reads any teammate's profile in the team subject to:
//     self          → always allowed
//     owner         → always allowed (owner sees every teammate's profile)
//     team_visible  → allowed for any team member
//     owner_only    → 403 for non-owner non-self
//
// FUNCTION-TIMEOUT SAFETY (Pitfall 8): the LLM normalize call is hard-capped
// at `timeoutMs: 8000` inside `normalizeProfileTerms`, so the post-LLM
// Supabase write still has headroom under Vercel's default 10s budget.
// No vercel.json override needed.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getProfile, upsertProfile } from '@/lib/recgon/profileStorage';
import { normalizeProfileTerms } from '@/lib/recgon/normalizeProfile';
import { ProfileSaveBodySchema } from '@/lib/schemas';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dedupAndFlatten(entries: Array<{ raw: string; canonical: string[] }>): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.canonical) {
      set.add(tag);
    }
  }
  return Array.from(set);
}

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
    // 404 not 403 — mirrors the existing /api/teams/[id]/route.ts pattern
    // (don't leak team existence to non-members).
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const body = ProfileSaveBodySchema.safeParse(bodyJson);
  if (!body.success) {
    return NextResponse.json(
      { error: 'invalid body', details: body.error.flatten() },
      { status: 400 },
    );
  }

  const normalization = await normalizeProfileTerms({
    skillsRaw: body.data.skillsRaw,
    strengthsRaw: body.data.strengthsRaw,
    interestsRaw: body.data.interestsRaw,
  });

  try {
    const profile = await upsertProfile({
      teamId,
      userId: session.user.id,
      skillsRaw: body.data.skillsRaw,
      strengthsRaw: body.data.strengthsRaw,
      interestsRaw: body.data.interestsRaw,
      skillsCanonical: dedupAndFlatten(normalization.skills),
      strengthsCanonical: dedupAndFlatten(normalization.strengths),
      interestsCanonical: dedupAndFlatten(normalization.interests),
      weeklyCapacityHours: body.data.weeklyCapacityHours,
      normalizationPending: normalization.degraded,
    });
    return NextResponse.json({ ok: true, profile, normalization });
  } catch (error) {
    logger.error('profile upsert failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed to save profile' }, { status: 500 });
  }
}

export async function GET(
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

  const targetUserId = req.nextUrl.searchParams.get('userId') ?? session.user.id;

  // ── Server-side visibility enforcement (Pitfall 6 / D-17..D-20) ──────────
  // Never trust client-side filtering. The route is the single source of
  // truth for who can read whose profile.
  const isSelf = targetUserId === session.user.id;
  const isOwner = role === 'owner';
  if (!isSelf && !isOwner) {
    // Cross-teammate read: gated by `teams.profile_visibility`.
    const { data: teamRow, error: teamErr } = await supabase
      .from('teams')
      .select('profile_visibility')
      .eq('id', teamId)
      .single();
    if (teamErr) {
      logger.warn('profile GET: failed to read team profile_visibility', {
        teamId,
        error: teamErr.message,
      });
    }
    const visibility =
      (teamRow as { profile_visibility?: string } | null)?.profile_visibility ??
      'team_visible';
    if (visibility === 'owner_only') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  try {
    const profile = await getProfile(teamId, targetUserId);
    return NextResponse.json({ profile });
  } catch (error) {
    logger.error('profile read failed', {
      teamId,
      targetUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'failed to read profile' }, { status: 500 });
  }
}
