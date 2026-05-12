// Phase 2 / SKILL-02 / D-25 — Weekly cron that enqueues one
// `github_skill_inference` job per consented teammate. Drained by the
// existing per-minute `/api/cron/llm-jobs` cron (no new drain logic needed).
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` in production. Local dev
// skips for friction-free testing — mirrors `recgon-schedule/route.ts:9-20`.
//
// T-02-06 mitigation: the cron route ONLY enqueues — it never mines inline.
// An unauthorized hit therefore cannot exfiltrate any data; the worst case
// is queue spam, which the per-minute drain absorbs.

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { enqueueJob } from '@/lib/llm/jobQueue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.warn('github-skill-inference cron: CRON_SECRET not set; rejecting');
    return false;
  }
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return got === expected;
}

type ConsentedTeammate = {
  teammateId: string;
  teamId: string;
  userId: string;
};

/**
 * Inline query: every `teammate_profiles` row with a non-null
 * `github_mining_consent_at`, joined with `agent_teammates` to get the
 * teammate-row id. Returns one entry per (teammate, team) pair.
 *
 * Inlined here per the plan — no new helper in `teamStorage.ts` mid-plan.
 */
async function listConsentedTeammates(): Promise<ConsentedTeammate[]> {
  const { data, error } = await supabase
    .from('teammate_profiles')
    .select('team_id, user_id, github_mining_consent_at')
    .not('github_mining_consent_at', 'is', null);
  if (error) {
    logger.warn('listConsentedTeammates: profile query failed', { err: error.message });
    return [];
  }
  const rows = (data ?? []) as Array<{ team_id: string; user_id: string }>;
  if (rows.length === 0) return [];

  // Resolve `teammate_id` per (team_id, user_id) by reading `agent_teammates`.
  // We do this as one batched query against an OR-of-pairs is awkward in
  // Supabase — chunk by team_id and per-team filter by user_id list.
  const byTeam = new Map<string, string[]>();
  for (const r of rows) {
    const list = byTeam.get(r.team_id) ?? [];
    list.push(r.user_id);
    byTeam.set(r.team_id, list);
  }
  const out: ConsentedTeammate[] = [];
  for (const [teamId, userIds] of byTeam.entries()) {
    try {
      const { data: tms, error: tmErr } = await supabase
        .from('agent_teammates')
        .select('id, user_id')
        .eq('team_id', teamId)
        .in('user_id', userIds);
      if (tmErr) {
        logger.warn('listConsentedTeammates: agent_teammates query failed', {
          teamId,
          err: tmErr.message,
        });
        continue;
      }
      for (const tm of (tms ?? []) as Array<{ id: string; user_id: string }>) {
        out.push({ teammateId: tm.id, teamId, userId: tm.user_id });
      }
    } catch (err) {
      logger.warn('listConsentedTeammates: agent_teammates threw', {
        teamId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const consented = await listConsentedTeammates();
  const results = await Promise.allSettled(
    consented.map((t) =>
      enqueueJob({
        teamId: t.teamId,
        userId: t.userId,
        kind: 'github_skill_inference',
        payload: {
          teammateId: t.teammateId,
          teamId: t.teamId,
          userId: t.userId,
        },
      }),
    ),
  );
  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'fulfilled') acc.enqueued += 1;
      else acc.failed += 1;
      return acc;
    },
    { enqueued: 0, failed: 0 },
  );
  logger.info('github-skill-inference cron complete', summary);
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

export async function POST(req: NextRequest) {
  return runCron(req);
}
