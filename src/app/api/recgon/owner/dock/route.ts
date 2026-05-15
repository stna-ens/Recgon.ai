// Phase 3.5 / Plan 03.5-02 — owner-only Triage Dock data endpoint.
//
// Returns the two task buckets that populate the dock on /projects:
//   - triaged:  status='unassigned' AND triage_note IS NOT NULL
//               (dispatcher refused to assign — no_clear_fit /
//                no_grounded_reason / no_capacity_*).
//   - deferred: status='unassigned' AND triage_note IS NULL AND
//               scheduled_date > CURRENT_DATE.
//
// Auth + role:
//   - Unauthenticated → 401.
//   - teamId missing → 400.
//   - verifyTeamAccess(teamId) !== 'owner' → 403 (covers members, viewers,
//     and users with NO role on this team — null gets the same 403).
//
// Privacy contract (T-3.5-03 / T-03-03-03 hedge):
//   The bulk response NEVER carries `assignmentReasoning`. The storage helper
//   `listOwnerDockTasks` strips it at the row-mapper boundary, AND this route
//   re-strips defensively (defense-in-depth — even if a future storage refactor
//   accidentally leaks the field, the API surface stays clean). The only
//   authorized surface for whyYouSentence is the existing per-task route
//   `/api/recgon/tasks/[id]` which applies the Phase-3 privacy filter.
//
// Read-only: no audit log entry. Audit log is reserved for mutations.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listOwnerDockTasks } from '@/lib/recgon/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';
import type { AgentTask } from '@/lib/recgon/types';

/**
 * Defensive re-strip: even if the storage helper leaks `assignmentReasoning`,
 * this route NEVER emits it. The destructure-and-discard is the runtime hedge.
 */
function scrubReasoning(rows: AgentTask[]): AgentTask[] {
  return rows.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignmentReasoning, ...rest } = row as AgentTask & {
      whyYouSentence?: string;
    };
    // Also strip whyYouSentence if it somehow rode along (storage shouldn't
    // populate it; bulk fetch never owns this surface).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { whyYouSentence, ...scrubbed } = rest as typeof rest & {
      whyYouSentence?: string;
    };
    return scrubbed as AgentTask;
  });
}

export async function GET(request: Request): Promise<Response> {
  // 1) Auth.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Validate teamId.
  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }

  // 3) Owner-only role gate. `null` (no role on this team / team missing)
  //    collapses to 403 alongside member/viewer — never expose existence info.
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // 4) Fetch + defensive re-strip. Pass viewer user id so per-user
  //    `owner_dock_dismissals` rows filter the deferred bucket (Plan 03.5-03).
  //    Triaged rows are NEVER filtered — they always need owner attention.
  const { triaged, deferred } = await listOwnerDockTasks(teamId, session.user.id);
  return NextResponse.json({
    triaged: scrubReasoning(triaged),
    deferred: scrubReasoning(deferred),
  });
}
