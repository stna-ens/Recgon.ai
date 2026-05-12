// Phase 2 / Plan 02-03 / SKILL-01.
//
// POST /api/teams/[id]/inferred-skills/scan
//   On-demand scan: runs the GitHub-skill-inference worker INLINE and returns
//   the result. Originally this enqueued a job into `llm_jobs` for the cron
//   to drain, but on Vercel Hobby the queue drain runs daily — so a "Re-scan"
//   click sat for up to 24h before producing pills. The auto weekly cron
//   (Sunday 06:00 UTC) still uses the queue; only the manual button is inline.
//
// GATES (unchanged from queue-based design):
//   - 412 { error: 'consent required' }  when githubMiningConsentAt is null.
//   - 429 { error: 'rate_limited', retryAfterMin } when lastScanAt < 1h ago.
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
import { runGithubSkillInference } from '@/lib/llm/workers';
import type { LLMJob } from '@/lib/llm/jobQueue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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
      return NextResponse.json({ error: 'team not found' }, { status: 404 });
    }

    // Inline worker run. Build a synthetic LLMJob — the worker only reads
    // `payload` and `team_id` from the job, the rest is bookkeeping for the
    // queue-driven path. Result is returned to the client so the UI can
    // refresh immediately without polling.
    const now = new Date().toISOString();
    const syntheticJob: LLMJob = {
      id: `inline-${crypto.randomUUID()}`,
      team_id: teamId,
      user_id: session.user.id,
      kind: 'github_skill_inference',
      payload: {
        teammateId: teammate.id,
        teamId,
        userId: session.user.id,
      },
      status: 'running',
      result: null,
      error: null,
      attempts: 1,
      max_attempts: 1,
      next_retry_at: now,
      locked_at: now,
      locked_by: 'inline-scan',
      created_at: now,
      updated_at: now,
    };

    const result = await runGithubSkillInference(syntheticJob);

    logger.info('inferred-skills inline scan complete', {
      teamId,
      userId: session.user.id,
      result,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error('inferred-skills scan failed', {
      teamId,
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'scan failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
