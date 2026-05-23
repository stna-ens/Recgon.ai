// Phase 3 / Plan 03-07 — owner manual-assign endpoint.
//
// The dispatcher refuses to auto-assign tasks when no candidate clears the
// FIT-signal floor (Plan 03-06) or when the grounded Why-you LLM returns
// null (Plan 03-05). Those tasks stay `status='unassigned'` with a
// `triage_note` flagging WHY. The owner sees them in the TASKS-page triage
// surface (Plan 03-07 UI) and can override via this endpoint.
//
// Auth + role:
//   - Unauthenticated → 401.
//   - Verified team member but NOT owner → 403. Manual override is an
//     owner-only action because it bypasses Recgon's safety-net refusal.
//
// Body: { assigneeId: string }. The assignee MUST be a teammate of the
// task's team — we do not allow assigning to a teammate from a different
// team (would corrupt the team-scoped inbox). Invalid → 400.
//
// State machine: only `status='unassigned'` tasks can be manually assigned.
// An already-assigned task → 409 (let the owner reassign via the existing
// /decline flow if they want a different assignee).
//
// On success the route writes a math_only AssignmentReasoning with all-zero
// math + the fixed Why-you sentence ("Owner manually assigned — no
// automatic fit found."). The reasoning is HONEST — zero math is the truth
// for a manual override; pretending the math justified the pick would be a
// lie. Plan 03-05's grounded LLM never ran because there was nothing to
// ground (otherwise Plan 03-06 would not have triaged).

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getTask,
  listTeammates,
  assignTask,
  clearTriageNote,
  logEvent,
} from '@/lib/recgon/storage';
import { enqueueReframeJob } from '@/lib/recgon/reframeEnqueue';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { logger } from '@/lib/logger';
import type { AssignmentReasoning } from '@/lib/recgon/types';

const MANUAL_ASSIGN_SENTENCE = 'Owner manually assigned — no automatic fit found.';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;

  // 1) Auth.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Task exists?
  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 3) Owner role on the task's team. Manual override is owner-only —
  //    members/viewers can never bypass Recgon's refusal.
  const role = await verifyTeamAccess(task.teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // 4) Body shape.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const assigneeId =
    body && typeof body === 'object' && 'assigneeId' in body
      ? (body as { assigneeId: unknown }).assigneeId
      : undefined;
  if (typeof assigneeId !== 'string' || assigneeId.length === 0) {
    return NextResponse.json({ error: 'assigneeId is required' }, { status: 400 });
  }

  // 5) Task must still be unassigned. Reassigning an already-assigned task
  //    uses the /decline flow which re-dispatches via the matcher.
  if (task.status !== 'unassigned') {
    return NextResponse.json(
      { error: 'Task is not in unassigned state' },
      { status: 409 },
    );
  }

  // 6) Validate the assigneeId is a teammate of THIS team. We list rather
  //    than getTeammate(id) so a cross-team teammate id returns 400, not a
  //    stale teammate row that happens to exist but isn't on this team.
  const teammates = await listTeammates(task.teamId);
  const assignee = teammates.find((t) => t.id === assigneeId);
  if (!assignee) {
    return NextResponse.json(
      { error: 'assigneeId is not a member of this team' },
      { status: 400 },
    );
  }

  // 7) Build the math_only reasoning. Honest representation: zero math,
  //    zero breakdown, fixed sentence. Manual override = no Recgon signal.
  const reasoning: AssignmentReasoning = {
    kind: 'math_only',
    mathScore: 0,
    mathBreakdown: {
      skillOverlap: 0,
      fitForKind: 0,
      availabilityNow: 0,
      loadHeadroom: 0,
      interestNudge: 0,
    },
    whyYouSentence: MANUAL_ASSIGN_SENTENCE,
  };

  // 8) Assign + clear triage_note. The sequence mirrors the dispatcher's
  //    success path — assign first, then clear the flag, so a mid-flight
  //    failure leaves the row in a coherent state (still triaged) rather
  //    than triage-cleared-but-unassigned.
  const priorTriageNote = task.triageNote ?? null;
  try {
    await assignTask(
      taskId,
      assigneeId,
      session.user.id,
      null,
      { scheduleNote: 'Manually assigned by owner.' },
      reasoning,
    );
    // Phase 4 follow-up — fire-and-forget reframe enqueue, mirrors the
    // dispatcher's success path (dispatcher.ts:1023). Without this, an owner's
    // manual override skips Phase 4 entirely and the assignee never sees
    // personalized text. Errors are swallowed inside enqueueReframeJob; the
    // outer .catch is defense-in-depth.
    enqueueReframeJob(taskId, assigneeId, task.teamId).catch((err) => {
      logger.warn('task_reframe enqueue helper threw (unexpected)', {
        taskId,
        assigneeTeammateId: assigneeId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
    await clearTriageNote(taskId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'assignment failed' },
      { status: 500 },
    );
  }

  // 9) Audit. The event payload captures owner_user_id (who triggered the
  //    override), assignee_id (who got the task), and prior_triage_note
  //    (WHY the override was needed). This makes the trail reconstructable
  //    end-to-end from the event log alone.
  await logEvent({
    teamId: task.teamId,
    teammateId: assigneeId,
    taskId,
    event: 'manually_assigned',
    payload: {
      owner_user_id: session.user.id,
      assignee_id: assigneeId,
      prior_triage_note: priorTriageNote,
    },
  });

  return NextResponse.json({ ok: true, taskId, assigneeId });
}
