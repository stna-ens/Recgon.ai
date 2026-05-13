// Phase 3 Plan 03 — recgon task GET route with assignment_reasoning
// privacy filter.
//
// This route hydrates the task pop-up (TaskDetailPanel) with the rendered
// "Why you" sentence. Privacy rule mirrors fit-score privacy (Phase 1 D-20):
//   - assignee sees their OWN line
//   - owner of the team sees every line
//   - other teammates see no line
//
// Hard rule (T-03-03-03): the RAW `assignment_reasoning` JSONB never leaves
// this route. Only the pre-rendered `whyYouSentence` string is exposed. This
// defends against a future schema change accidentally leaking richer data
// (candidate user_ids, math scores, judge confidence labels) through the
// API surface, AND it stops a malformed/HTML-tainted reasoning blob from
// being reflected back into the client unescaped (T-03-03-04).

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTask, getTeammate } from '@/lib/recgon/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { renderWhyYou } from '@/lib/recgon/whyYou';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify the viewer can see this task at all (team membership). Strip
  // the raw reasoning blob from the response either way — the only allowed
  // exposure is the rendered sentence.
  const role = await verifyTeamAccess(task.teamId, session.user.id);
  if (!role) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Detach assignment_reasoning from the response payload before privacy
  // decisioning. `task` is the in-memory shape mapped from the DB row —
  // mutating the field on a fresh shallow clone is safe.
  const { assignmentReasoning, ...rest } = task;

  // Decide who can see the "Why you" sentence. The assignee check requires
  // mapping `task.assignedTo` (teammate id) → that teammate's `userId`,
  // because the session knows about users not teammates.
  let isAssignee = false;
  if (task.assignedTo) {
    const assigneeTeammate = await getTeammate(task.assignedTo);
    if (assigneeTeammate?.userId && assigneeTeammate.userId === session.user.id) {
      isAssignee = true;
    }
  }
  const isOwner = role === 'owner';

  // Compose the response: never include the raw blob. When authorized,
  // include the rendered sentence as `whyYouSentence`. When not, omit
  // the field entirely so clients can't infer the existence of reasoning.
  const responsePayload: Record<string, unknown> = { ...rest };
  if (assignmentReasoning && (isAssignee || isOwner)) {
    const out = renderWhyYou(assignmentReasoning);
    responsePayload.whyYouSentence = out.sentence;
  }

  return NextResponse.json({ task: responsePayload });
}
