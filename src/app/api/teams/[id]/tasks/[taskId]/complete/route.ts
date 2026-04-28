import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, getTeammate, updateTaskStatus, logEvent } from '@/lib/recgon/storage';
import { enqueueVerification } from '@/lib/recgon/verify';
import { logger } from '@/lib/logger';

// Human marks an accepted/in-progress task complete with optional notes.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!task.assignedTo) return NextResponse.json({ error: 'Task not assigned' }, { status: 400 });

  const teammate = await getTeammate(task.assignedTo);
  if (teammate?.userId && teammate.userId !== session.user.id && role !== 'owner') {
    return NextResponse.json({ error: 'Only the assignee or team owner can complete' }, { status: 403 });
  }

  let summary: string | undefined;
  try {
    const body = (await request.json()) as { summary?: string };
    summary = body?.summary;
  } catch {
    /* no body */
  }

  await updateTaskStatus(taskId, 'awaiting_review', {
    result: { summary: summary ?? '(completed by human teammate)', completedBy: 'human' },
  });
  await logEvent({
    teamId,
    teammateId: task.assignedTo,
    taskId,
    event: 'completed',
    payload: { by: session.user.id, summary },
  });

  // Recgon takes over from here: kick off auto-verification. Failures here
  // are non-fatal — the task still reaches awaiting_review and the owner can
  // override if verification never resolves.
  enqueueVerification(taskId).catch((err) => {
    logger.warn('failed to enqueue task verification', {
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ success: true });
}
