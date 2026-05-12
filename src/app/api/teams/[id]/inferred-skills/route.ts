// Phase 2 / Plan 02-03 / SKILL-03 + SKILL-01.
//
// GET /api/teams/[id]/inferred-skills
//   Lists the requesting teammate's `teammate_inferred_skills` rows along with
//   `lastScanAt` and `githubMiningConsentAt` (read off `teammate_profiles`).
//
// AUTHORIZATION (T-02-16 / IDOR):
//   - session + verifyTeamAccess (404 not 403 on team mismatch).
//   - `?userId=` is accepted but enforced self-only in v1: any other value
//     returns 404 (don't leak teammate existence to peers, even within team).
//
// FUNCTION-TIMEOUT SAFETY: pure DB reads, no LLM call — well under 10s.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  listInferredSkills,
  getTeammateByTeamUser,
  getMiningStatus,
} from '@/lib/recgon/inferredSkillsStorage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // Self-only in v1 (T-02-16). The `?userId=` param exists for forward-compat
  // with a future team-visible mode, but any mismatched value resolves 404.
  const targetUserId =
    req.nextUrl.searchParams.get('userId') ?? session.user.id;
  if (targetUserId !== session.user.id) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }

  try {
    const teammate = await getTeammateByTeamUser(teamId, targetUserId);
    if (!teammate) {
      // Defensive: user is in `team_members` but not yet mirrored to `teammates`.
      // Return an empty shape rather than a 500 — the UI handles this cleanly.
      return NextResponse.json({
        inferredSkills: [],
        lastScanAt: null,
        githubMiningConsentAt: null,
      });
    }

    const [inferredSkills, mining] = await Promise.all([
      listInferredSkills(teammate.id),
      getMiningStatus(teamId, targetUserId),
    ]);

    return NextResponse.json({
      inferredSkills,
      lastScanAt: mining?.lastScanAt ?? null,
      githubMiningConsentAt: mining?.githubMiningConsentAt ?? null,
    });
  } catch (error) {
    logger.error('inferred-skills list failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to list inferred skills' },
      { status: 500 },
    );
  }
}
