// Phase 3.5 / Plan 03.5-03 — owner-only dock dismiss endpoint.
//
// Hides a deferred task from THIS owner's Triage Dock view. The dismissal is
// per-user (PK on user_id + task_id) — another owner on the same team still
// sees the row until they dismiss it themselves. The task chip stays visible
// in the calendar grid; only the dock row is filtered out.
//
// Auth + role:
//   - Unauthenticated → 401.
//   - Body missing taskId / non-string taskId → 400.
//   - Task not found → 404.
//   - Triaged task (triage_note IS NOT NULL) → 400 ("only deferred tasks can
//     be dismissed"). Per D-17, triaged rows represent dispatcher refusals
//     that always need owner attention and must NOT be dismissable.
//   - verifyTeamAccess(task.teamId) !== 'owner' → 403.
//
// Idempotent: ON CONFLICT DO NOTHING via storage upsert. Repeated POSTs all
// return 200 without side effects.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTask, dismissDockItem } from '@/lib/recgon/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';

export async function POST(request: Request): Promise<Response> {
  // 1) Auth.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Body shape.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const taskId =
    body && typeof body === 'object' && 'taskId' in body
      ? (body as { taskId: unknown }).taskId
      : undefined;
  if (typeof taskId !== 'string' || taskId.length === 0) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
  }

  // 3) Task must exist.
  const task = await getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 4) Owner-only on the task's team. `null` (no role) collapses to 403
  //    alongside member/viewer so existence isn't disclosed.
  const role = await verifyTeamAccess(task.teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // 5) Triaged-rows-are-not-dismissable guard (D-17). Triaged tasks have
  //    triage_note set; they need owner action and the UI doesn't even
  //    render the dismiss × on those rows. Defensive 400 if the request
  //    is hand-crafted.
  if (task.triageNote !== null) {
    return NextResponse.json(
      { error: 'only deferred tasks can be dismissed' },
      { status: 400 },
    );
  }

  // 6) Persist + return. Idempotent upsert.
  await dismissDockItem(session.user.id, taskId);
  return NextResponse.json({ ok: true });
}
