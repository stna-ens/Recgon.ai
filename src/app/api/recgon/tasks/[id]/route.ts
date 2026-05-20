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

  // Decide viewer role. The assignee check requires mapping
  // `task.assignedTo` (teammate id) → that teammate's `userId`, because
  // the session knows about users not teammates.
  let isAssignee = false;
  if (task.assignedTo) {
    const assigneeTeammate = await getTeammate(task.assignedTo);
    if (assigneeTeammate?.userId && assigneeTeammate.userId === session.user.id) {
      isAssignee = true;
    }
  }
  const isOwner = role === 'owner';

  // Phase 4 / Plan 02 — viewer-discriminated description.
  // Serve the personalized text ONLY when ALL three predicates hold:
  //   1. the viewer is the assignee (by userId, not teammateId)
  //   2. `personalizedDescription` is a non-empty string (worker has run)
  //   3. `personalizedDescriptionForUserId` matches THIS viewer's userId
  //      (defense against the mid-reassignment race: Plan 04-03 nulls the
  //      column on assignee change, but until that sweep runs the read
  //      boundary must refuse to serve stale personalized text to a
  //      different user — FRAME-04 safety net).
  // Otherwise the viewer (owner, other teammate, or the assignee during
  // the cron-cycle gap before reframe has landed) sees the original
  // brain description. The decision is server-side; the client receives
  // ONE `description` field, server-already-resolved, and cannot inspect
  // which version it got (T-04-02-01).
  const shouldServePersonalized =
    isAssignee &&
    typeof task.personalizedDescription === 'string' &&
    task.personalizedDescription.length > 0 &&
    task.personalizedDescriptionForUserId === session.user.id;
  const effectiveDescription = shouldServePersonalized
    ? task.personalizedDescription
    : task.description;

  // Privacy boundary: explicitly destructure and overwrite — NEVER spread
  // the raw task into the response (T-04-02-01 mitigation). The raw
  // personalized fields and the original description are pulled out and
  // discarded; the response carries the server-selected description under
  // the single `description` key.
  const {
    assignmentReasoning,
    personalizedDescription: _pd,
    personalizedDescriptionForUserId: _pdfu,
    description: _origDesc,
    ...restWithoutDescription
  } = task;
  void _pd;
  void _pdfu;
  void _origDesc;

  const responsePayload: Record<string, unknown> = {
    ...restWithoutDescription,
    description: effectiveDescription,
  };

  // Phase 3 Plan 03 — never include the raw assignment_reasoning blob.
  // When authorized (assignee or team owner), include the rendered "Why
  // you" sentence; otherwise omit so clients can't infer the existence
  // of reasoning.
  //
  // Plan 05: renderWhyYou is async — in production the envelope already
  // carries `whyYouSentence` (pre-rendered by dispatcher) and this awaits
  // a no-op string read. Legacy rows (pre-Plan-05) may trigger an LLM
  // call on first read; for null sentences we still emit the field as
  // `null` so the client UI can branch on it explicitly.
  if (assignmentReasoning && (isAssignee || isOwner)) {
    const out = await renderWhyYou(assignmentReasoning);
    responsePayload.whyYouSentence = out.sentence;
  }

  return NextResponse.json({ task: responsePayload });
}
