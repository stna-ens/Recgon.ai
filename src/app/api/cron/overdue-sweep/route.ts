// Phase 3.6 / Plan 01 — Vercel cron endpoint for overdue task pressure.
//
// Invoked daily at 09:00 UTC by the Vercel cron config in vercel.json. This
// is the WALKING SKELETON: it authenticates the request and calls the
// (currently stubbed) `sweepOverdueTeams()` entry point that Plan 02 will
// fill in with real decision logic (nudge → escalate → auto_reschedule).
//
// Today the route returns zeros — that's intentional. The schema, schedule,
// and route are all in place so Plan 02 can land a pure-function policy
// (`overduePolicy.ts`) and Plan 03 can wire Resend emails + storage writes
// without touching the cron contract again.
//
// Security: mirrors `src/app/api/cron/llm-jobs/route.ts`. In production the
// `Authorization: Bearer ${CRON_SECRET}` header is required (Vercel signs
// cron invocations with it). Local dev (no CRON_SECRET set, NODE_ENV !==
// 'production') skips the check so the route is callable from the browser
// for smoke-testing.

import { NextRequest, NextResponse } from 'next/server';
import { sweepOverdueTeams } from '@/lib/recgon/storage';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  try {
    const result = await sweepOverdueTeams();
    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - tickStart,
    });
  } catch (err) {
    logger.error('overdue-sweep failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg, durationMs: Date.now() - tickStart },
      { status: 500 },
    );
  }
}

// Allow POST as well so Vercel's cron runner and manual triggers both work,
// matching the llm-jobs pattern.
export const POST = GET;
