import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTask,
  getTeammate,
  reassignTask,
  logEvent,
} from '@/lib/recgon/storage';
import { dispatchTask } from '@/lib/recgon/dispatcher';

// Human declines a task — Recgon unassigns and re-routes to the next best
// fit (excluding the decliner via a temporary skill-override fallback path:
// for Slice 2 we just re-dispatch and trust matching to pick someone else
// with the now-decremented availability of the original assignee).
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
    return NextResponse.json({ error: 'Only the assignee or team owner can decline' }, { status: 403 });
  }

  let note: string | undefined;
  try {
    const body = (await request.json()) as { note?: string };
    note = body?.note;
  } catch {
    /* no body — that's fine */
  }

  // Log the decline against the previous assignee, then unassign and re-dispatch.
  const previousTeammateId = task.assignedTo;
  await reassignTask(taskId, null, session.user.id);
  await logEvent({
    teamId,
    teammateId: previousTeammateId,
    taskId,
    event: 'declined',
    payload: { by: session.user.id, note },
  });

  // Re-dispatch immediately. Failures are non-fatal — the task is now
  // unassigned and the next dispatch tick will pick it up.
  let reassignedTo: string | null = null;
  try {
    const result = await dispatchTask(teamId, taskId);
    if (result === 'assigned') {
      const fresh = await getTask(taskId);
      reassignedTo = fresh?.assignedTo ?? null;
    }
  } catch {
    /* swallowed */
  }

  return NextResponse.json({ success: true, reassignedTo });
}
