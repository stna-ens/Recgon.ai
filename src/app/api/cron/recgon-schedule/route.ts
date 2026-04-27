import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { listActiveTeamIds, runScheduledForTeam } from '@/lib/recgon/scheduled';

// Vercel cron: daily Recgon scheduled brain pass. For each active team,
// mint recurring entries (weekly health, daily anomaly scan), then dispatch.
// Idempotent — re-running in the same window is a no-op via dedupKey.

function isAuthorized(req: NextRequest): boolean {
  // Skip auth in local dev to avoid friction.
  if (process.env.NODE_ENV !== 'production') return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured in prod = lock down.
    logger.warn('recgon-schedule cron: CRON_SECRET not set; rejecting');
    return false;
  }
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return got === expected;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const teamIds = await listActiveTeamIds();
  const results = await Promise.allSettled(teamIds.map((id) => runScheduledForTeam(id)));
  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'fulfilled') {
        acc.teams += 1;
        acc.minted += r.value.minted;
        acc.skipped += r.value.skipped;
        acc.assigned += r.value.dispatched.assigned;
        acc.noFit += r.value.dispatched.noFit;
      } else {
        acc.errors += 1;
      }
      return acc;
    },
    { teams: 0, minted: 0, skipped: 0, assigned: 0, noFit: 0, errors: 0 },
  );
  logger.info('recgon-schedule cron complete', summary);
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: NextRequest) {
  return runCron(req);
}

export async function POST(req: NextRequest) {
  return runCron(req);
}
