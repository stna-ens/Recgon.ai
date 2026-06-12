import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import {
  getTask,
  deleteTask,
  updateTaskStatus,
  updateTaskDetails,
  logEvent,
} from '@/lib/recgon/storage';
import { enqueueReframeJob } from '@/lib/recgon/reframeEnqueue';
import { sanitizeTaskForClient } from '@/lib/recgon/taskSanitizer';
import { logger } from '@/lib/logger';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _request: NextRequest,
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
  // CR-01: strip reasoning + personalized columns at the route boundary.
  // Personalized text is only served by the viewer-discriminated route at
  // /api/recgon/tasks/[id]; this listing surface must never leak it.
  return NextResponse.json({ task: sanitizeTaskForClient(task) });
}

export async function DELETE(
  _request: NextRequest,
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
  await deleteTask(taskId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    description?: string;
    priority?: number;
    deadline?: string | null;
  };

  if (body.action === 'cancel') {
    if (['completed', 'cancelled'].includes(task.status)) {
      return NextResponse.json({ error: `Cannot cancel a ${task.status} task` }, { status: 400 });
    }
    await updateTaskStatus(taskId, 'cancelled');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'edit') {
    // Permission: team owner, or the creator of a user-minted task. Brain-
    // minted tasks are only editable by the owner — a member rewriting
    // Recgon's task definition would silently desync it from the brain's
    // dedup keys and the assignment reasoning.
    const role = await verifyTeamAccess(teamId, session.user.id);
    const isCreator = task.source === 'user' && task.createdBy === session.user.id;
    if (role !== 'owner' && !isCreator) {
      return NextResponse.json({ error: 'Only the team owner or the task creator can edit' }, { status: 403 });
    }
    if (['completed', 'cancelled'].includes(task.status)) {
      return NextResponse.json({ error: `Cannot edit a ${task.status} task` }, { status: 400 });
    }

    const fields: { title?: string; description?: string; priority?: number; deadline?: string | null } = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return NextResponse.json({ error: 'title must be 1-200 characters' }, { status: 400 });
      }
      fields.title = title;
    }
    if (body.description !== undefined) {
      const description = String(body.description).trim();
      if (description.length > 4000) {
        return NextResponse.json({ error: 'description must be at most 4000 characters' }, { status: 400 });
      }
      fields.description = description;
    }
    if (body.priority !== undefined) {
      if (![1, 2, 3].includes(body.priority)) {
        return NextResponse.json({ error: 'priority must be 1, 2, or 3' }, { status: 400 });
      }
      fields.priority = body.priority;
    }
    if (body.deadline !== undefined) {
      if (body.deadline === null || body.deadline === '') {
        fields.deadline = null;
      } else if (typeof body.deadline === 'string' && ISO_DATE.test(body.deadline)) {
        fields.deadline = `${body.deadline}T23:59:59Z`;
      } else {
        return NextResponse.json({ error: 'deadline must be YYYY-MM-DD or null' }, { status: 400 });
      }
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'nothing to edit' }, { status: 400 });
    }

    await updateTaskDetails(taskId, fields);

    // A description edit invalidated the personalized text inside
    // updateTaskDetails — re-personalize for the current assignee.
    if (fields.description !== undefined && task.assignedTo) {
      enqueueReframeJob(taskId, task.assignedTo, teamId).catch((err) => {
        logger.warn('edit: reframe enqueue failed', {
          taskId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    await logEvent({
      teamId,
      teammateId: task.assignedTo,
      taskId,
      event: 'edited',
      payload: { by: session.user.id, fields: Object.keys(fields) },
    });

    const fresh = (await getTask(taskId)) ?? task;
    return NextResponse.json({ task: sanitizeTaskForClient(fresh) });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
