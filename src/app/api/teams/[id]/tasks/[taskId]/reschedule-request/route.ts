import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  getTask,
  getTeammate,
  logEvent,
  requestTaskReschedule,
  setTaskRescheduleRequestStatus,
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
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (TERMINAL_STATUSES.has(task.status)) {
    return NextResponse.json({ error: `Cannot reschedule a ${task.status} task` }, { status: 400 });
  }
  if (!task.assignedTo) {
    return NextResponse.json({ error: 'Task is not assigned yet' }, { status: 400 });
  }

  const teammate = await getTeammate(task.assignedTo);
  const isAssignee = teammate?.userId === session.user.id;
  if (!isAssignee && role !== 'owner') {
    return NextResponse.json({ error: 'Only the assignee or team owner can request a reschedule' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    note?: string;
    requestedDate?: string | null;
  };
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 800) : '';
  let requestedDate: string | null = null;
  if (body.requestedDate !== undefined && body.requestedDate !== null && body.requestedDate !== '') {
    if (typeof body.requestedDate !== 'string' || !ISO_DATE.test(body.requestedDate)) {
      return NextResponse.json({ error: 'requestedDate must be a YYYY-MM-DD string' }, { status: 400 });
    }
    requestedDate = body.requestedDate;
  }

  await requestTaskReschedule(taskId, {
    requestedBy: session.user.id,
    note,
    requestedDate,
  });
  await logEvent({
    teamId,
    teammateId: task.assignedTo,
    taskId,
    event: 'reschedule_requested',
    payload: {
      by: session.user.id,
      note,
      requestedDate,
    },
  });

  return NextResponse.json({ success: true });
}

// Owner denies a pending reschedule request: the request is marked
// dismissed (schedule unchanged) and the audit trail records who said no.
// Approval has no endpoint of its own — approving IS rescheduling, via
// POST /schedule, which resolves the pending request as a side effect.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can resolve reschedule requests' }, { status: 403 });
  }

  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (task.rescheduleRequestStatus !== 'pending') {
    return NextResponse.json({ error: 'No pending reschedule request' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'dismiss') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  await setTaskRescheduleRequestStatus(taskId, 'dismissed');
  await logEvent({
    teamId,
    teammateId: task.assignedTo,
    taskId,
    event: 'reschedule_dismissed',
    payload: {
      by: session.user.id,
      requestedDate: task.rescheduleRequestedDate,
      note: task.rescheduleRequestNote,
    },
  });

  return NextResponse.json({ success: true });
}
