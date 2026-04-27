import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { getTask, getTeammate, reassignTask, logEvent } from '@/lib/recgon/storage';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as { teammateId: string | null };
  const newTeammate = body.teammateId ? await getTeammate(body.teammateId) : null;
  if (body.teammateId && (!newTeammate || newTeammate.teamId !== teamId)) {
    return NextResponse.json({ error: 'Invalid teammate' }, { status: 400 });
  }

  await reassignTask(taskId, body.teammateId, session.user.id);

  await logEvent({
    teamId,
    teammateId: body.teammateId,
    taskId,
    event: 'reassigned',
    payload: { by: session.user.id },
  });

  return NextResponse.json({ success: true });
}
