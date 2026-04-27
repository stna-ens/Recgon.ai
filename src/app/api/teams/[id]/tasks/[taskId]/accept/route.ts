import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, getTeammate, updateTaskStatus, logEvent } from '@/lib/recgon/storage';

// Human teammate accepts an assigned task. Only the assignee (or a team
// owner/member acting on their behalf) can accept.
export async function POST(
  _request: NextRequest,
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
  if (task.status !== 'assigned') {
    return NextResponse.json({ error: `Cannot accept from status=${task.status}` }, { status: 400 });
  }

  const teammate = await getTeammate(task.assignedTo);
  if (teammate?.userId && teammate.userId !== session.user.id && role !== 'owner') {
    return NextResponse.json({ error: 'Only the assignee or team owner can accept' }, { status: 403 });
  }

  await updateTaskStatus(taskId, 'accepted');
  await logEvent({ teamId, teammateId: task.assignedTo, taskId, event: 'accepted' });
  return NextResponse.json({ success: true });
}
