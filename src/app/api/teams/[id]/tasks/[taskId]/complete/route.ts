import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, getTeammate, updateTaskStatus, logEvent } from '@/lib/recgon/storage';

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

  return NextResponse.json({ success: true });
}
