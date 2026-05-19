// Phase 3.6 / Plan 03 — Owner-initiated snooze route.
//
// POST /api/teams/[id]/tasks/[taskId]/snooze
//   Body: { days: number }   // 1 ≤ integer ≤ 30
//   Auth: team-owner only
//
// Pushes `scheduled_date` forward, resets `overdue_tier` to 0, clears the
// 24h cool-down timestamp, and writes a `snoozed` event-log row. Sibling
// to `.../schedule/route.ts` — same auth pattern, narrower body shape.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, snoozeTask } from '@/lib/recgon/storage';
import { logOverdueCounter } from '@/lib/logger';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'declined', 'failed']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can snooze tasks' }, { status: 403 });
  }

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (TERMINAL_STATUSES.has(task.status)) {
    return NextResponse.json({ error: `Cannot snooze a ${task.status} task` }, { status: 400 });
  }

  let body: { days?: unknown };
  try {
    body = (await request.json()) as { days?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const days = body.days;
  if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > 30) {
    return NextResponse.json(
      { error: 'days must be an integer between 1 and 30' },
      { status: 400 },
    );
  }

  await snoozeTask(taskId, days as number);
  logOverdueCounter('snoozed', { teamId, taskId });

  return NextResponse.json({ ok: true });
}
