import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import { listTasks } from '@/lib/recgon/storage';
import { mintUserTask } from '@/lib/recgon/taskMint';
import { dispatchTask } from '@/lib/recgon/dispatcher';
import type { TaskKind, TaskStatus } from '@/lib/recgon/types';

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
  return NextResponse.json({ tasks });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const allowed = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const body = (await request.json()) as {
    projectId?: string | null;
    title?: string;
    description?: string;
    kind?: TaskKind;
    requiredSkills?: string[];
    priority?: number;
    estimatedHours?: number;
    deadline?: string | null;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  const kind: TaskKind = body.kind && VALID_KINDS.includes(body.kind) ? body.kind : 'custom';

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

  // Try to dispatch immediately so the user sees an assignment without
  // waiting for the next cron tick. Failures here aren't fatal — the
  // 5-min cron (Slice 3) and analysis-completion hook will catch up.
  try {
    await dispatchTask(teamId, task.id);
  } catch {
    /* swallowed — the task is already persisted as unassigned */
  }

  return NextResponse.json({ task });
}
