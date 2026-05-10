import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/apiError';

// Team Pulse — the "team health" view a real PM cares about on Monday morning.
//
// This is NOT the inbox tab and NOT the teammates page. It's a vital-signs
// reading on the roster + work-in-flight:
//   - Per-teammate load (in-flight task count vs capacity hours)
//   - "Stuck pile" — tasks idle in proof_requested/awaiting_review > 48h
//     (the AI is waiting on a human to unblock)
//   - Velocity — tasks completed this week vs last week
//   - Idle members — anyone with zero task activity in 7 days
//
// All five signals are computed from agent_tasks + teammates so we never
// invent metrics that don't tie to real work.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const STUCK_THRESHOLD_MS = 2 * DAY_MS; // 48 hours in proof/review

const IN_FLIGHT_STATUSES = ['assigned', 'accepted', 'in_progress', 'awaiting_review'];

function isInsightOnlySourceRef(ref: unknown): boolean {
  return Boolean(ref && typeof ref === 'object' && (ref as { kind?: unknown }).kind === 'top_risk');
}

export type TeamPulseMember = {
  teammateId: string;
  displayName: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  inFlight: number;
  capacityHours: number;
  loadPct: number; // 0..100+ (rough load gauge: inFlight tasks vs cap-hours)
  completed7d: number;
  lastActivityAt: string | null; // ISO
  isIdle: boolean; // human + no activity in 7d
};

export type TeamPulseStuck = {
  taskId: string;
  title: string;
  projectName: string | null;
  assigneeName: string | null;
  stage: 'proof_requested' | 'awaiting_review' | 'failed';
  ageDays: number;
};

export type TeamPulseVelocity = {
  thisWeek: number;
  lastWeek: number;
  delta: number; // thisWeek - lastWeek
  trend: 'up' | 'down' | 'flat';
};

export type TeamPulsePayload = {
  members: TeamPulseMember[];
  stuck: TeamPulseStuck[];
  velocity: TeamPulseVelocity;
  idleCount: number;
  totalMembers: number;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - WEEK_MS).toISOString();
    const fourteenDaysAgo = new Date(now - 2 * WEEK_MS).toISOString();
    const stuckCutoff = new Date(now - STUCK_THRESHOLD_MS).toISOString();

    const [teammatesRes, inFlightRes, completedRes, stuckRes, projectsRes] = await Promise.all([
      // Active teammates only — retired ones don't count toward capacity.
      supabase
        .from('teammates')
        .select('id, display_name, avatar_color, avatar_url, capacity_hours, status')
        .eq('team_id', teamId)
        .neq('status', 'retired'),
      // Everything currently in flight, so we can attribute load per teammate.
      supabase
        .from('agent_tasks')
        .select('id, assigned_to, estimated_hours, assigned_at, source_ref')
        .eq('team_id', teamId)
        .in('status', IN_FLIGHT_STATUSES),
      // Last-14d completions: 7d for "thisWeek" + the previous 7d for "lastWeek".
      supabase
        .from('agent_tasks')
        .select('id, assigned_to, completed_at, source_ref')
        .eq('team_id', teamId)
        .eq('status', 'completed')
        .gte('completed_at', fourteenDaysAgo),
      // Stuck pile: in proof/review/failed AND last update > 48h ago.
      // We approximate "last update" with assigned_at since there's no
      // separate updated_at — for proof_requested specifically the assigned_at
      // is when the work started, so age there is the meaningful "how long
      // has this been waiting on me" signal.
      supabase
        .from('agent_tasks')
        .select('id, title, project_id, assigned_to, status, verification_status, assigned_at, source_ref')
        .eq('team_id', teamId)
        .or('status.eq.awaiting_review,verification_status.eq.proof_requested,verification_status.eq.failed')
        .lt('assigned_at', stuckCutoff)
        .order('assigned_at', { ascending: true })
        .limit(8),
      // Project name lookup so the stuck list shows project context.
      supabase.from('projects').select('id, name').eq('team_id', teamId),
    ]);

    type TeammateRow = {
      id: string;
      display_name: string;
      avatar_color: string | null;
      avatar_url: string | null;
      capacity_hours: number;
    };
    const teammates: TeammateRow[] = (teammatesRes.data ?? []) as unknown as TeammateRow[];
    const teammateById = new Map<string, TeammateRow>(teammates.map((t) => [t.id, t]));

    const projectMap = new Map<string, string>(
      ((projectsRes.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
    );

    // Per-teammate aggregates.
    const inFlightByTeammate = new Map<string, number>();
    const lastActivityByTeammate = new Map<string, number>(); // ms
    for (const raw of inFlightRes.data ?? []) {
      const t = raw as { assigned_to: string | null; assigned_at: string | null; source_ref: Record<string, unknown> | null };
      if (isInsightOnlySourceRef(t.source_ref)) continue;
      if (!t.assigned_to) continue;
      inFlightByTeammate.set(t.assigned_to, (inFlightByTeammate.get(t.assigned_to) ?? 0) + 1);
      if (t.assigned_at) {
        const ts = new Date(t.assigned_at).getTime();
        const prev = lastActivityByTeammate.get(t.assigned_to) ?? 0;
        if (ts > prev) lastActivityByTeammate.set(t.assigned_to, ts);
      }
    }

    const completedThisWeekBy = new Map<string, number>();
    let velocityThisWeek = 0;
    let velocityLastWeek = 0;
    for (const raw of completedRes.data ?? []) {
      const t = raw as { assigned_to: string | null; completed_at: string | null; source_ref: Record<string, unknown> | null };
      if (isInsightOnlySourceRef(t.source_ref)) continue;
      if (!t.completed_at) continue;
      const ts = new Date(t.completed_at).getTime();
      if (ts >= now - WEEK_MS) {
        velocityThisWeek++;
        if (t.assigned_to) {
          completedThisWeekBy.set(t.assigned_to, (completedThisWeekBy.get(t.assigned_to) ?? 0) + 1);
          const prev = lastActivityByTeammate.get(t.assigned_to) ?? 0;
          if (ts > prev) lastActivityByTeammate.set(t.assigned_to, ts);
        }
      } else {
        velocityLastWeek++;
      }
    }

    const members: TeamPulseMember[] = teammates.map((t) => {
      const inFlight = inFlightByTeammate.get(t.id) ?? 0;
      const completed7d = completedThisWeekBy.get(t.id) ?? 0;
      const lastTs = lastActivityByTeammate.get(t.id) ?? null;
      const cap = Number(t.capacity_hours) || 1;
      // Heuristic load: each in-flight task ~= 4h of attention. Bound at 150%.
      const loadPct = Math.min(150, Math.round((inFlight * 4 / cap) * 100));
      const isIdle = inFlight === 0 && completed7d === 0;
      return {
        teammateId: t.id,
        displayName: t.display_name,
        avatarColor: t.avatar_color,
        avatarUrl: t.avatar_url,
        inFlight,
        capacityHours: cap,
        loadPct,
        completed7d,
        lastActivityAt: lastTs ? new Date(lastTs).toISOString() : null,
        isIdle,
      };
    });

    // Sort: highest load first, idle humans last so the eye lands on overload.
    members.sort((a, b) => {
      if (a.isIdle !== b.isIdle) return a.isIdle ? 1 : -1;
      if (a.loadPct !== b.loadPct) return b.loadPct - a.loadPct;
      return a.displayName.localeCompare(b.displayName);
    });

    // Stuck pile.
    type StuckRow = {
      id: string;
      title: string;
      project_id: string | null;
      assigned_to: string | null;
      status: string;
      verification_status: string;
      assigned_at: string | null;
      source_ref: Record<string, unknown> | null;
    };
    const stuck: TeamPulseStuck[] = ((stuckRes.data ?? []) as StuckRow[]).filter((row) => !isInsightOnlySourceRef(row.source_ref)).map((row) => {
      const stage: TeamPulseStuck['stage'] =
        row.verification_status === 'failed'
          ? 'failed'
          : row.verification_status === 'proof_requested'
            ? 'proof_requested'
            : 'awaiting_review';
      const ageMs = row.assigned_at ? now - new Date(row.assigned_at).getTime() : 0;
      const ageDays = Math.max(2, Math.round(ageMs / DAY_MS));
      const assignee = row.assigned_to ? (teammateById.get(row.assigned_to)?.display_name ?? null) : null;
      return {
        taskId: row.id,
        title: row.title,
        projectName: row.project_id ? (projectMap.get(row.project_id) ?? null) : null,
        assigneeName: assignee,
        stage,
        ageDays,
      };
    });

    const velocityDelta = velocityThisWeek - velocityLastWeek;
    const trend: TeamPulseVelocity['trend'] =
      velocityDelta > 0 ? 'up' : velocityDelta < 0 ? 'down' : 'flat';

    const idleCount = members.filter((m) => m.isIdle).length;

    const payload: TeamPulsePayload = {
      members,
      stuck,
      velocity: { thisWeek: velocityThisWeek, lastWeek: velocityLastWeek, delta: velocityDelta, trend },
      idleCount,
      totalMembers: members.length,
    };

    return NextResponse.json(payload);
  } catch (err) {
    return serverError('GET /api/overview/team-pulse', err);
  }
}
