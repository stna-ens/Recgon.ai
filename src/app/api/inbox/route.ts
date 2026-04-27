import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';

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
    .select('id, team_id, project_id, title, description, kind, source, priority, status, assigned_at, deadline, result, created_at, completed_at, assigned_to')
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

  return NextResponse.json({
    tasks: (tasks ?? []).map((t) => ({
      ...t,
      teamName: teamNameById.get(t.team_id as string) ?? 'Team',
    })),
    counts: { open, awaitingReview },
  });
}
