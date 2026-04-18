// Vercel cron endpoint — drains the llm_jobs queue.
//
// Invoked every minute by the Vercel cron config in vercel.json. Claims up
// to MAX_BATCH pending jobs atomically (FOR UPDATE SKIP LOCKED), runs them
// in parallel, and records the result on each row. Crashed / timed-out
// jobs are released back to pending via releaseStuckJobs() at the start of
// each tick.
//
// Security: Vercel signs cron invocations with a `CRON_SECRET` header. In
// local dev the check is skipped.

import { NextRequest, NextResponse } from 'next/server';
import { claimNextJob, completeJob, failJob, releaseStuckJobs } from '@/lib/llm/jobQueue';
import { runJob, workerRegistered } from '@/lib/llm/workers';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 3;

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = request.headers.get('authorization');
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tickStart = Date.now();
  const processed: Array<{ id: string; kind: string; status: 'succeeded' | 'failed' }> = [];

  try {
    const released = await releaseStuckJobs();
    if (released > 0) logger.info('cron released stuck jobs', { count: released });
  } catch (err) {
    logger.error('releaseStuckJobs failed', err);
  }

  for (let i = 0; i < MAX_BATCH; i++) {
    let job;
    try {
      job = await claimNextJob();
    } catch (err) {
      logger.error('claimNextJob failed', err);
      break;
    }
    if (!job) break;

    if (!workerRegistered(job.kind)) {
      await failJob(job, `No worker registered for kind=${job.kind}`);
      processed.push({ id: job.id, kind: job.kind, status: 'failed' });
      continue;
    }

    try {
      const result = await runJob(job);
      await completeJob(job.id, result);
      processed.push({ id: job.id, kind: job.kind, status: 'succeeded' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await failJob(job, msg);
      } catch (failErr) {
        logger.error('failJob failed to record failure', failErr);
      }
      processed.push({ id: job.id, kind: job.kind, status: 'failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    durationMs: Date.now() - tickStart,
  });
}

// Allow POST as well so Vercel's cron runner (which some configurations use)
// and manual triggers both work.
export const POST = GET;
