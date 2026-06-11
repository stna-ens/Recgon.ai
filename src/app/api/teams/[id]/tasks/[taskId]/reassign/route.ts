import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamWriteAccess, getTeam } from '@/lib/teamStorage';
import { notifyTeammateAssigned } from '@/lib/notifications';
import {
  getTask,
  getTeammate,
  reassignTask,
  logEvent,
  loadHoursByDateForTeammate,
  loadHoursByDateForUser,
} from '@/lib/recgon/storage';
import { planTaskSchedule } from '@/lib/recgon/scheduler';

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

  let schedule:
    | { scheduledDate: string; deadline: string | null; scheduleNote: string }
    | undefined;

  if (body.teammateId && newTeammate) {
    const now = new Date();
    const hardDeadline = task.scheduleNote ? null : task.deadline;
    const to = hardDeadline
      ? new Date(hardDeadline)
      : new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(to.getTime())) {
      return NextResponse.json({ error: 'Task deadline is invalid' }, { status: 400 });
    }
    const fromDate = now.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);
    const loadByDate = newTeammate.userId
      ? await loadHoursByDateForUser(newTeammate.userId, fromDate, toDate, taskId)
      : await loadHoursByDateForTeammate(body.teammateId, fromDate, toDate, taskId);
    const plan = planTaskSchedule({
      teammate: newTeammate,
      task: { ...task, deadline: hardDeadline },
      loadByDate,
      now,
    });
    if (!plan) {
      return NextResponse.json(
        { error: 'No working day available for this teammate before the deadline.' },
        { status: 409 },
      );
    }
    schedule = {
      scheduledDate: plan.scheduledDate,
      deadline: plan.deadline,
      scheduleNote: plan.scheduleNote,
    };
    await reassignTask(taskId, body.teammateId, session.user.id, schedule);
  } else {
    await reassignTask(taskId, null, session.user.id, task.scheduleNote ? { deadline: null } : undefined);
  }

  await logEvent({
    teamId,
    teammateId: body.teammateId,
    taskId,
    event: 'reassigned',
    payload: {
      by: session.user.id,
      scheduledDate: schedule?.scheduledDate,
      scheduleNote: schedule?.scheduleNote,
    },
  });

  // Tell the new assignee — previously only first assignment emailed, so a
  // reassigned task could sit unnoticed until its owner asked about it.
  // Fire-and-forget: notifyTeammateAssigned logs failures, never throws.
  if (newTeammate) {
    const team = await getTeam(teamId);
    void notifyTeammateAssigned({
      teammate: newTeammate,
      task: { ...task, assignedTo: newTeammate.id },
      teamName: team?.name ?? 'your team',
      reasoning: null,
    });
  }

  return NextResponse.json({ success: true });
}
