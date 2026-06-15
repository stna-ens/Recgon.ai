import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import {
  listTasks,
  getTask,
  listTeammates,
  assignTask,
  setTaskSchedule,
  clearTriageNote,
} from '@/lib/recgon/storage';
import { sanitizeTaskForClient } from '@/lib/recgon/taskSanitizer';
import { mintUserTask } from '@/lib/recgon/taskMint';
import { dispatchTask } from '@/lib/recgon/dispatcher';
import { planTaskSchedule } from '@/lib/recgon/scheduler';
import { enqueueReframeJob } from '@/lib/recgon/reframeEnqueue';
import { buildManualAssignReasoning } from '@/lib/recgon/manualAssign';
import { logger } from '@/lib/logger';
import type { TaskKind, TaskStatus } from '@/lib/recgon/types';

// End-of-day ISO for a YYYY-MM-DD date — used as the deadline back-compat
// field when the owner pins a specific schedule day (mirrors scheduler.ts).
function endOfDayIso(scheduledDate: string): string {
  return new Date(`${scheduledDate}T23:59:59Z`).toISOString();
}

const VALID_STATUSES: TaskStatus[] = [
  'unassigned', 'assigned', 'accepted', 'in_progress',
  'awaiting_review', 'completed', 'declined', 'failed', 'cancelled',
];
const VALID_KINDS: TaskKind[] = ['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') as TaskStatus | null;
  const teammateId = url.searchParams.get('teammateId');
  const kind = url.searchParams.get('kind') as TaskKind | null;
  const projectId = url.searchParams.get('projectId');

  const tasks = await listTasks(teamId, {
    status: status && VALID_STATUSES.includes(status) ? status : undefined,
    teammateId: teammateId ?? undefined,
    kind: kind && VALID_KINDS.includes(kind) ? kind : undefined,
    projectId: projectId ?? undefined,
  });
  // CR-01: strip reasoning + personalized columns at the route boundary.
  // The mapped AgentTask carries them so the worker + the
  // viewer-discriminated route can read them, but every other surface must
  // NOT serialize them — the canonical privacy invariant lives at the read
  // boundary, not in storage.
  return NextResponse.json({ tasks: tasks.map(sanitizeTaskForClient) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // verifyTeamAccess returns the role string ('owner' | 'member' | 'viewer' |
  // null). We need the role itself for the owner-gated person-assign branch
  // below, so call it directly rather than the boolean write helper.
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role || role === 'viewer') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = (await request.json()) as {
    projectId?: string | null;
    title?: string;
    description?: string;
    kind?: TaskKind;
    requiredSkills?: string[];
    priority?: number;
    estimatedHours?: number;
    deadline?: string | null;
    // Manual-create extras:
    //  - assigneeId: a teammate id (owner-only), or null / "auto" → Recgon picks.
    //  - scheduledDate: YYYY-MM-DD to pin the day, or null → Recgon schedules.
    assigneeId?: string | null;
    scheduledDate?: string | null;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  const kind: TaskKind = body.kind && VALID_KINDS.includes(body.kind) ? body.kind : 'custom';

  // Normalize the two "let Recgon decide" sentinels. Absent / null / the
  // literal "auto" all mean "auto".
  const wantsPerson =
    typeof body.assigneeId === 'string' &&
    body.assigneeId.length > 0 &&
    body.assigneeId !== 'auto';
  const explicitDate =
    typeof body.scheduledDate === 'string' && body.scheduledDate.length > 0
      ? body.scheduledDate
      : null;

  const task = await mintUserTask({
    teamId,
    projectId: body.projectId ?? null,
    title: body.title.trim(),
    description: body.description?.trim() || '',
    kind,
    requiredSkills: body.requiredSkills,
    priority: body.priority,
    estimatedHours: body.estimatedHours,
    deadline: body.deadline ?? null,
    createdBy: session.user.id,
  });

  if (wantsPerson) {
    // ── PERSON branch (owner-only) ─────────────────────────────────────────
    // Manual assignment to a specific teammate bypasses the matcher, exactly
    // like /api/recgon/tasks/[id]/assign. That makes it an owner-only action.
    if (role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the owner can assign a task to a specific teammate' },
        { status: 403 },
      );
    }
    const teammates = await listTeammates(teamId);
    const assignee = teammates.find((t) => t.id === body.assigneeId);
    if (!assignee) {
      return NextResponse.json(
        { error: 'assigneeId is not a member of this team' },
        { status: 400 },
      );
    }

    const reasoning = buildManualAssignReasoning();
    let schedule: {
      scheduledDate?: string | null;
      deadline?: string | null;
      scheduleNote?: string | null;
    } | undefined;

    if (explicitDate) {
      // Owner pinned the exact day.
      schedule = {
        scheduledDate: explicitDate,
        deadline: endOfDayIso(explicitDate),
        scheduleNote: 'Manually scheduled by owner.',
      };
    } else {
      // Auto-schedule for the chosen teammate. If the planner finds no slot,
      // we still assign — just without a computed day (null schedule).
      const plan = planTaskSchedule({ teammate: assignee, task });
      schedule = plan
        ? { scheduledDate: plan.scheduledDate, deadline: plan.deadline, scheduleNote: plan.scheduleNote }
        : { scheduleNote: 'Manually assigned by owner.' };
    }

    await assignTask(task.id, assignee.id, session.user.id, null, schedule, reasoning);
    // Phase 4 follow-up — fire-and-forget reframe enqueue, mirrors the assign
    // route + dispatcher success path. Errors swallowed inside the helper.
    enqueueReframeJob(task.id, assignee.id, teamId).catch((err) => {
      logger.warn('task_reframe enqueue helper threw (unexpected)', {
        taskId: task.id,
        assigneeTeammateId: assignee.id,
        err: err instanceof Error ? err.message : String(err),
      });
    });
    await clearTriageNote(task.id);
  } else {
    // ── AUTO assignee branch ───────────────────────────────────────────────
    // Try to dispatch immediately so the user sees an assignment without
    // waiting for the next cron tick. Failures here aren't fatal — the daily
    // cron + analysis-completion hook will catch up.
    try {
      await dispatchTask(teamId, task.id);
    } catch {
      /* swallowed — the task is already persisted as unassigned */
    }

    // AUTO assignee + explicit date: the dispatcher may have assigned + chosen
    // a day; override that day with the owner's pinned date if it landed
    // assigned. (If still unassigned, there's nothing to schedule yet — the
    // next dispatch will pick the day.)
    if (explicitDate) {
      const afterDispatch = await getTask(task.id);
      if (afterDispatch && afterDispatch.status !== 'unassigned') {
        await setTaskSchedule(task.id, {
          scheduledDate: explicitDate,
          deadline: endOfDayIso(explicitDate),
          scheduleNote: 'Schedule set by owner.',
        });
      }
    }
  }

  // Return the fresh row so the client can tell "assigned to X" apart from
  // "queued for next run".
  const fresh = (await getTask(task.id)) ?? task;
  return NextResponse.json({ task: sanitizeTaskForClient(fresh) });
}
