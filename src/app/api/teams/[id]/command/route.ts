import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { listTasks, listTeammatesWithStats } from '@/lib/recgon/storage';
import { sanitizeTaskForClient, type ClientSafeTask } from '@/lib/recgon/taskSanitizer';
import { supabase } from '@/lib/supabase';

// Mission Control aggregation. One fetch powers the whole /command page:
// the owner's "needs decision" stack plus the team-wide task table.
//
// Privacy:
//   - Every task passes through sanitizeTaskForClient (CR-01: no raw
//     assignment_reasoning, no personalized columns).
//   - The decision stack is OWNER-ONLY. Members receive `decisions: null`
//     — gated server-side, not hidden client-side.
//
// The 3.5 lesson is encoded in the ranking: the stack answers "what is
// blocking this team right now", ordered by how urgently the owner's
// judgment is needed, NOT by who is busy.

type DecisionGroups = {
  rescheduleRequests: ClientSafeTask[];
  overdue: ClientSafeTask[];
  triaged: ClientSafeTask[];
  awaitingReview: ClientSafeTask[];
};

const ACTIVE_STATUSES = new Set(['assigned', 'accepted', 'in_progress']);

// Within the triaged group, capacity-blocked high-priority tasks outrank
// the rest (work the team WANTS done but cannot absorb beats work nobody
// fits).
const TRIAGE_RANK: Record<string, number> = {
  no_capacity_high_priority: 0,
  no_clear_fit: 1,
  no_grounded_reason: 2,
  no_capacity_in_window: 3,
};

function buildDecisions(tasks: ClientSafeTask[]): DecisionGroups {
  const rescheduleRequests = tasks.filter(
    (t) => t.rescheduleRequestStatus === 'pending' && ACTIVE_STATUSES.has(t.status),
  );
  const overdue = tasks
    .filter((t) => (t.overdueTier ?? 0) >= 3 && ACTIVE_STATUSES.has(t.status))
    .sort((a, b) => (b.overdueTier ?? 0) - (a.overdueTier ?? 0));
  const triaged = tasks
    .filter((t) => t.status === 'unassigned' && t.triageNote != null)
    .sort(
      (a, b) =>
        (TRIAGE_RANK[a.triageNote ?? ''] ?? 9) - (TRIAGE_RANK[b.triageNote ?? ''] ?? 9) ||
        b.priority - a.priority,
    );
  const awaitingReview = tasks.filter((t) => t.status === 'awaiting_review');
  return { rescheduleRequests, overdue, triaged, awaitingReview };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const [tasks, teammates, projectsRes] = await Promise.all([
    listTasks(teamId),
    listTeammatesWithStats(teamId),
    supabase.from('projects').select('id, name').eq('team_id', teamId),
  ]);
  if (projectsRes.error) {
    return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });
  }

  const safeTasks = tasks.map(sanitizeTaskForClient);

  return NextResponse.json({
    role,
    decisions: role === 'owner' ? buildDecisions(safeTasks) : null,
    tasks: safeTasks,
    teammates: teammates.map((t) => {
      // Load headroom for the Dispatch Floor pods. Real in-flight hours vs
      // configured capacity (>100% = overloaded). Cross-team hours are
      // already folded in by listTeammatesWithStats. Cap at 150 so a wildly
      // overloaded teammate doesn't blow out the bar's numeric label.
      const cap = t.capacityHours || 0;
      const hrs = t.inFlightHours ?? 0;
      const loadPct = cap > 0 ? Math.min(150, Math.round((hrs / cap) * 100)) : hrs > 0 ? 150 : 0;
      return {
        id: t.id,
        userId: t.userId ?? null,
        displayName: t.displayName,
        avatarColor: t.avatarColor ?? null,
        avatarUrl: t.avatarUrl ?? null,
        capacityHours: cap,
        inFlightHours: hrs,
        loadPct,
        isIdle: (t.inFlightCount ?? 0) === 0,
        skills: t.skills ?? [],
        stars: t.stars,
      };
    }),
    projects: (projectsRes.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    })),
  });
}
