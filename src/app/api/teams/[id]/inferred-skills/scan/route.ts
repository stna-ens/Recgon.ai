// Phase 2 / Plan 02-03 / SKILL-01.
//
// POST /api/teams/[id]/inferred-skills/scan
//   On-demand enqueue of a `github_skill_inference` job for the requesting
//   teammate.
//
// GATES:
//   - 412 { error: 'consent required' }  when githubMiningConsentAt is null.
//   - 429 { error: 'rate_limited', retryAfterMin } when lastScanAt < 1h ago
//     (T-02-18). Drained by the per-minute /api/cron/llm-jobs route, so
//     on-demand vs scheduled scans cannot interleave to bypass the cap.
//
// AUTHORIZATION (Phase 1 convention):
//   session + verifyTeamAccess (404 not 403 on team mismatch).

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTeammateByTeamUser,
  getMiningStatus,
} from '@/lib/recgon/inferredSkillsStorage';
import { enqueueJob } from '@/lib/llm/jobQueue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function POST(
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
    const mining = await getMiningStatus(teamId, session.user.id);
    if (!mining?.githubMiningConsentAt) {
      return NextResponse.json(
        { error: 'consent required' },
        { status: 412 },
      );
    }

    if (mining.lastScanAt) {
      const elapsedMs = Date.now() - new Date(mining.lastScanAt).getTime();
      if (elapsedMs < ONE_HOUR_MS) {
        const retryAfterMin = Math.max(1, Math.ceil((ONE_HOUR_MS - elapsedMs) / 60000));
        return NextResponse.json(
          { error: 'rate_limited', retryAfterMin },
          { status: 429 },
        );
      }
    }

    const teammate = await getTeammateByTeamUser(teamId, session.user.id);
    if (!teammate) {
      // No teammate row → can't scan. Treat as 404 (defensive: caller's UI
      // shouldn't expose Re-scan when not even a teammate).
      return NextResponse.json({ error: 'team not found' }, { status: 404 });
    }

    const job = await enqueueJob({
      teamId,
      userId: session.user.id,
      kind: 'github_skill_inference',
      payload: {
        teammateId: teammate.id,
        teamId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (error) {
    logger.error('inferred-skills scan failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'failed to enqueue scan' },
      { status: 500 },
    );
  }
}
