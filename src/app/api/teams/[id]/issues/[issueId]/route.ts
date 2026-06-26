import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import {
  getIssue,
  listTasksForIssue,
  updateIssueStatus,
  closeIssue,
  deleteIssue,
} from '@/lib/issueStorage';
import { sanitizeTaskForClient } from '@/lib/recgon/taskSanitizer';
import type { IssueStatus } from '@/lib/issueStorage';

// Guard: the issue must exist AND belong to the team in the URL (T-mkn-01).
// Returns the issue when valid, or a NextResponse to short-circuit when not.
async function loadTeamIssue(teamId: string, issueId: string) {
  const issue = await getIssue(issueId);
  if (!issue || issue.teamId !== teamId) {
    return { error: NextResponse.json({ error: 'Issue not found' }, { status: 404 }) };
  }
  return { issue };
}

// GET — one issue plus the tasks it spawned (source='issue' linkage).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { id: teamId, issueId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const loaded = await loadTeamIssue(teamId, issueId);
  if ('error' in loaded) return loaded.error;

  const tasks = await listTasksForIssue(issueId);
  return NextResponse.json({
    issue: loaded.issue,
    tasks: tasks.map(sanitizeTaskForClient),
  });
}

// PATCH — close / reopen an issue. Body { status }.
const PATCHABLE: IssueStatus[] = ['open', 'converted', 'closed'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { id: teamId, issueId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const canWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const loaded = await loadTeamIssue(teamId, issueId);
  if ('error' in loaded) return loaded.error;

  const body = (await request.json()) as { status?: string };
  if (!body.status || !PATCHABLE.includes(body.status as IssueStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  if (body.status === 'closed') {
    await closeIssue(issueId);
  } else {
    await updateIssueStatus(issueId, body.status as IssueStatus);
  }

  const fresh = await getIssue(issueId);
  return NextResponse.json({ issue: fresh });
}

// DELETE — remove the issue (the spawned tasks are left in place).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { id: teamId, issueId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const canWrite = await verifyTeamWriteAccess(teamId, session.user.id);
  if (!canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const loaded = await loadTeamIssue(teamId, issueId);
  if ('error' in loaded) return loaded.error;

  await deleteIssue(issueId);
  return NextResponse.json({ ok: true });
}
