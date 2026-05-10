import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { supabase } from '@/lib/supabase';
import { getAllProjects } from '@/lib/storage';

// Triage feed for /verify. Unlike /api/inbox (which is per-user and filters
// to active assignments), this returns ALL tasks in the team that need a
// human decision because Recgon couldn't verify on its own:
//
//   - failed              — AI rejected the proof; owner overrides or re-requests
//   - proof_requested     — AI is inconclusive and asked for proof
//   - auto_inconclusive   — AI couldn't decide (often transitions to proof_requested)
//   - auto_running        — AI is mid-flight (only flagged as "stuck" when >24h)
//   - proof_evaluating    — AI is judging fresh proof (same caveat)
//
// Team-scoped, not user-scoped, so an owner sees every failed verification
// across the team — not just the ones assigned to them.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const TRIAGE_STATUSES = [
    'failed',
    'proof_requested',
    'auto_inconclusive',
    'auto_running',
    'proof_evaluating',
  ];

  const [tasksRes, projects, myTeammatesRes] = await Promise.all([
    supabase
      .from('agent_tasks')
      .select(
        'id, team_id, project_id, title, description, kind, source, priority, status, assigned_at, deadline, scheduled_date, schedule_note, result, verification_status, verification_evidence, assigned_to, proof',
      )
      .eq('team_id', teamId)
      .in('verification_status', TRIAGE_STATUSES)
      .order('assigned_at', { ascending: false })
      .limit(100),
    getAllProjects(teamId, session.user.id),
    // The teammate row(s) the signed-in user owns inside this team. Used by
    // the verify UI to gate proof submission + decline (assignee-only) so the
    // team owner can't act on someone else's behalf.
    supabase
      .from('teammates')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', session.user.id),
  ]);

  if (tasksRes.error) {
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });
  }

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const tasks = (tasksRes.data ?? []).map((t) => ({
    ...t,
    projectName: t.project_id ? (projectMap[t.project_id] ?? null) : null,
  }));

  const currentTeammateIds = (myTeammatesRes.data ?? []).map((r) => r.id);

  return NextResponse.json({
    tasks,
    role,
    currentTeammateIds,
    counts: {
      total: tasks.length,
      failed: tasks.filter((t) => t.verification_status === 'failed').length,
      awaiting: tasks.filter(
        (t) => t.verification_status === 'proof_requested' || t.verification_status === 'auto_inconclusive',
      ).length,
      stuck: tasks.filter((t) => {
        const vs = t.verification_status;
        if (vs !== 'auto_running' && vs !== 'proof_evaluating') return false;
        const age = Date.now() - new Date(t.assigned_at).getTime();
        return age > 24 * 3_600_000;
      }).length,
    },
  });
}
