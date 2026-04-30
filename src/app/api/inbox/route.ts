import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { runTaskVerification } from '@/lib/recgon/verify';
import { logger } from '@/lib/logger';

// Per-user inbox: every task assigned to a teammate row whose user_id is the
// current user, across every team the user belongs to. No teamId scoping —
// the inbox is the user's own view, joined via teammates.
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  // 1) Find teammate rows belonging to this user (one per team they're in).
  const { data: teammates, error: tmErr } = await supabase
    .from('teammates')
    .select('id, team_id, display_name, status')
    .eq('user_id', userId)
    .neq('status', 'retired');
  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });

  const teammateIds = (teammates ?? []).map((t) => t.id);
  if (teammateIds.length === 0) {
    return NextResponse.json({ tasks: [], counts: { open: 0, awaitingReview: 0 } });
  }

  // 2) Tasks assigned to any of those teammate rows that aren't terminal.
  const { data: tasks, error: tErr } = await supabase
    .from('agent_tasks')
    .select('id, team_id, project_id, title, description, kind, source, priority, status, assigned_at, deadline, result, created_at, completed_at, assigned_to, verification_status, verification_evidence')
    .in('assigned_to', teammateIds)
    .in('status', ['assigned', 'accepted', 'in_progress', 'awaiting_review'])
    .order('priority', { ascending: true })
    .order('assigned_at', { ascending: false })
    .limit(100);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // 3) Decorate with team name for inbox display.
  const teamIds = Array.from(new Set((tasks ?? []).map((t) => t.team_id)));
  const teamsRes =
    teamIds.length > 0
      ? await supabase.from('teams').select('id, name').in('id', teamIds)
      : { data: [], error: null };
  const teamNameById = new Map<string, string>();
  (teamsRes.data ?? []).forEach((t) => teamNameById.set(t.id as string, t.name as string));

  const open = (tasks ?? []).filter((t) => t.status !== 'awaiting_review').length;
  const awaitingReview = (tasks ?? []).filter((t) => t.status === 'awaiting_review').length;

  // Self-heal: kick verification for any task stuck mid-flight with no live
  // stage. Covers `auto_running` (Mark done flow) and `proof_evaluating` (after
  // teammate submitted proof). Both paths queue a job whose drain depends on
  // the daily cron — without this kick, the worker never runs in dev and
  // takes up to 24 h in prod. Fire-and-forget; the worker is idempotent.
  const stuck = (tasks ?? []).filter((t) => {
    const vs = t.verification_status as string | null;
    if (vs !== 'auto_running' && vs !== 'proof_evaluating') return false;
    const ev = t.verification_evidence as { stage?: string } | null;
    return !ev?.stage;
  });
  for (const s of stuck) {
    const mode: 'auto' | 'proof_evaluation' =
      (s.verification_status as string) === 'proof_evaluating' ? 'proof_evaluation' : 'auto';
    void runTaskVerification({ taskId: s.id as string, mode }).catch((err) => {
      logger.warn('inbox: self-heal verification failed', {
        taskId: s.id,
        mode,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return NextResponse.json({
    tasks: (tasks ?? []).map((t) => ({
      ...t,
      teamName: teamNameById.get(t.team_id as string) ?? 'Team',
    })),
    counts: { open, awaitingReview },
  });
}
