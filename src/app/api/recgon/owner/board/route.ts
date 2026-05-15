// Phase 3.5 / Plan 03.5-02 — owner-only workload board data endpoint.
//
// DEVIATION FROM PLAN: The plan said "REUSE the existing assigned-task fetch
// from WeekCalendar; DO NOT introduce a parallel endpoint." Wave 1's
// 03.5-01-SUMMARY.md flagged this for revisit, and inspection of
// `WeekCalendar.tsx` confirmed it hits `/api/teams/[id]/calendar?projectId=X`
// — a PROJECT-scoped endpoint. The owner board needs an ALL-PROJECTS view of
// active tasks in a 14-day window, which `/calendar` cannot supply without
// special-casing `projectId=*` (which would pollute a personal-scope
// endpoint with owner concerns). Minting a dedicated owner endpoint keeps
// owner-auth surfaces co-located under `/api/recgon/owner/*` (alongside
// `/api/recgon/owner/dock`) and leaves `/calendar` untouched.
//
// Query: ?teamId=X&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Returns: { teammates: TeammateWithStats[], tasks: AgentTask[] }
//   - teammates: active teammates only (status !== 'retired'), via
//     listTeammatesWithStats so capacity-bar math has access to fitProfile +
//     in-flight hours just like the calendar.
//   - tasks: assigned/accepted/in_progress/awaiting_review tasks whose
//     scheduled_date falls in [startDate, endDate] inclusive. Privacy:
//     assignmentReasoning stripped at the storage helper boundary AND
//     re-stripped here defensively (T-3.5-03 / T-03-03-03 hedge).
//
// Auth + role: owner-only. Members/viewers/non-team-users → 403.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  listTeammatesWithStats,
  listAssignedTasksInWindow,
} from '@/lib/recgon/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';
import type { AgentTask } from '@/lib/recgon/types';

function scrubReasoning(rows: AgentTask[]): AgentTask[] {
  return rows.map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { assignmentReasoning, ...rest } = row as AgentTask & {
      whyYouSentence?: string;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { whyYouSentence, ...scrubbed } = rest as typeof rest & {
      whyYouSentence?: string;
    };
    return scrubbed as AgentTask;
  });
}

// ISO date validation (YYYY-MM-DD); rejects garbage to avoid Supabase
// turning malformed strings into a 500.
function isIsoDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return NextResponse.json(
      { error: 'startDate and endDate are required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const [teammates, tasks] = await Promise.all([
    listTeammatesWithStats(teamId),
    listAssignedTasksInWindow(teamId, startDate, endDate),
  ]);
  return NextResponse.json({
    teammates: teammates.filter((t) => t.status !== 'retired'),
    tasks: scrubReasoning(tasks),
  });
}
