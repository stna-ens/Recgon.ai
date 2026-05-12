// Phase 2 / Plan 02-03 / SKILL-05.
//
// PATCH /api/teams/[id]/inferred-skills/[skillId]
//   Body: InferredSkillPatchBodySchema { rejected?: boolean, reviewed?: boolean }
//   - rejected: true  → rejectInferredSkill(skillId)       (sets rejected_at = now())
//   - rejected: false → undoRejection(skillId)             (clears rejected_at, 6s undo)
//   - reviewed: true  → markInferredSkillReviewed(skillId) (sets user_reviewed_at = now())
//
// AUTHORIZATION (T-02-15 — IDOR):
//   1. session + verifyTeamAccess (404 not 403 on team mismatch).
//   2. Load row → 404 if row.teamId !== [id] (cross-team IDOR).
//   3. 403 if getTeammateUserId(row.teammateId) !== session.user.id
//      (right team, wrong teammate).

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getInferredSkill,
  getTeammateUserId,
  rejectInferredSkill,
  undoRejection,
  markInferredSkillReviewed,
} from '@/lib/recgon/inferredSkillsStorage';
import { InferredSkillPatchBodySchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id: teamId, skillId } = await params;

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role === null) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const body = InferredSkillPatchBodySchema.safeParse(bodyJson);
  if (!body.success) {
    return NextResponse.json(
      { error: 'invalid body', details: body.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await getInferredSkill(skillId);
    // T-02-15: cross-team IDOR → 404 (never leak skill existence to a peer team).
    if (!row || row.teamId !== teamId) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    // Right team, wrong teammate → 403. Surfaces ownership explicitly.
    const rowOwner = await getTeammateUserId(row.teammateId);
    if (rowOwner !== session.user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    let updated = row;
    if (body.data.rejected === true) {
      updated = await rejectInferredSkill(skillId);
    } else if (body.data.rejected === false) {
      updated = await undoRejection(skillId);
    }
    if (body.data.reviewed === true) {
      updated = await markInferredSkillReviewed(skillId);
    }

    return NextResponse.json({ ok: true, inferredSkill: updated });
  } catch (error) {
    logger.error('inferred-skills patch failed', {
      teamId,
      skillId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to update inferred skill' },
      { status: 500 },
    );
  }
}
