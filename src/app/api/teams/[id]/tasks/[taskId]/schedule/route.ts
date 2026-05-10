import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTask,
  getTeammate,
  logEvent,
  reassignTask,
  setTaskRescheduleRequestStatus,
  setTaskSchedule,
} from '@/lib/recgon/storage';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'declined', 'failed']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can reschedule tasks directly' }, { status: 403 });
  }

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (TERMINAL_STATUSES.has(task.status)) {
    return NextResponse.json({ error: `Cannot reschedule a ${task.status} task` }, { status: 400 });
  }

  const body = (await request.json()) as {
    teammateId?: string;
    scheduledDate?: string;
    scheduledUntilDate?: string | null;
  };
  if (!body.teammateId) {
    return NextResponse.json({ error: 'teammateId is required' }, { status: 400 });
  }
  const teammate = await getTeammate(body.teammateId);
  if (!teammate || teammate.teamId !== teamId || teammate.status === 'retired') {
    return NextResponse.json({ error: 'Invalid teammate' }, { status: 400 });
  }

  if (typeof body.scheduledDate !== 'string' || !ISO_DATE.test(body.scheduledDate)) {
    return NextResponse.json({ error: 'scheduledDate must be a YYYY-MM-DD string' }, { status: 400 });
  }
  const scheduledDate = body.scheduledDate;
  let scheduledUntilDate: string | null = null;
  if (body.scheduledUntilDate !== undefined && body.scheduledUntilDate !== null) {
    if (typeof body.scheduledUntilDate !== 'string' || !ISO_DATE.test(body.scheduledUntilDate)) {
      return NextResponse.json({ error: 'scheduledUntilDate must be a YYYY-MM-DD string' }, { status: 400 });
    }
    if (body.scheduledUntilDate < scheduledDate) {
      return NextResponse.json({ error: 'scheduledUntilDate must be on or after scheduledDate' }, { status: 400 });
    }
    scheduledUntilDate = body.scheduledUntilDate === scheduledDate ? null : body.scheduledUntilDate;
  }
  const lastDay = scheduledUntilDate ?? scheduledDate;
  const dayEnd = new Date(`${lastDay}T23:59:59Z`);
  if (!Number.isFinite(dayEnd.getTime())) {
    return NextResponse.json({ error: 'scheduledDate is not a valid date' }, { status: 400 });
  }

  const hours = Math.max(0.25, Number(task.estimatedHours) || 1);
  const rangeLabel = scheduledUntilDate ? `${scheduledDate} → ${scheduledUntilDate}` : scheduledDate;
  const schedule = {
    scheduledDate,
    scheduledUntilDate,
    deadline: dayEnd.toISOString(),
    scheduleNote: `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h reserved on ${rangeLabel} by the team owner.`,
  };

  const sameAssignee = task.assignedTo === body.teammateId && task.status !== 'unassigned';
  if (sameAssignee) {
    await setTaskSchedule(taskId, schedule);
  } else {
    await reassignTask(taskId, body.teammateId, session.user.id, schedule);
  }

  if (task.rescheduleRequestStatus === 'pending') {
    await setTaskRescheduleRequestStatus(taskId, 'resolved');
  }

  await logEvent({
    teamId,
    teammateId: body.teammateId,
    taskId,
    event: 'rescheduled',
    payload: {
      by: session.user.id,
      previousTeammateId: task.assignedTo,
      scheduledDate,
      scheduledUntilDate,
    },
  });

  return NextResponse.json({ success: true, schedule });
}
