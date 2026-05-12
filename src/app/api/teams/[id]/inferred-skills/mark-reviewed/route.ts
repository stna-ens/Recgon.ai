// Phase 2 / Plan 02-03 / SKILL-06.
//
// PATCH /api/teams/[id]/inferred-skills/mark-reviewed
//   Bulk-clears unreviewed state for the requesting teammate by setting
//   `user_reviewed_at = now()` on every row where it's currently null.
//   Drives the "N new inferred skills — review" banner: clicking the X
//   dismiss icon hits this route, the banner suppresses, and future scans
//   that emit fresh rows re-raise the banner with the new (smaller) count.
//
// AUTHORIZATION:
//   session + verifyTeamAccess (404 not 403 on team mismatch). Operates
//   exclusively on the caller's own teammate row (lookup via teamId +
//   session.user.id) — no caller-supplied teammateId, so no IDOR surface.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTeammateByTeamUser,
  markBannerReviewed,
} from '@/lib/recgon/inferredSkillsStorage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
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
    const teammate = await getTeammateByTeamUser(teamId, session.user.id);
    if (!teammate) {
      return NextResponse.json({ error: 'team not found' }, { status: 404 });
    }
    await markBannerReviewed(teammate.id);
    return NextResponse.json({
      ok: true,
      markedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('inferred-skills mark-reviewed failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to mark banner reviewed' },
      { status: 500 },
    );
  }
}
