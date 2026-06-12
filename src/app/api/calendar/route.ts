import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { listScheduledTasksForUser } from '@/lib/recgon/storage';

// Personal calendar: every scheduled task assigned to the signed-in user
// across every team they belong to. Mirrors the cross-team aggregation in
// /api/inbox but adds a date-range filter and returns mapped AgentTask
// objects plus team metadata for color-coding.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 });
  }

  const tasks = await listScheduledTasksForUser(userId, from, to);

  const teamIds = Array.from(new Set(tasks.map((t) => t.teamId)));
  let teams: Array<{ id: string; name: string; avatarColor: string | null }> = [];
  if (teamIds.length > 0) {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, avatar_color')
      .in('id', teamIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    teams = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      avatarColor: (r.avatar_color as string | null) ?? null,
    }));
  }

  // Lane structure should be stable across week navigations: render a lane
  // for every project the user currently has a scheduled non-terminal task
  // in, even if that project has zero cards in the visible window. Without
  // this, navigating weeks makes lanes appear/disappear.
  const { data: tmRows, error: tmErr } = await supabase
    .from('teammates')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'retired');
  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });
  const teammateIds = (tmRows ?? []).map((r) => r.id as string);

  let projectIds: string[] = [];
  if (teammateIds.length > 0) {
    const { data: pidRows, error: pidErr } = await supabase
      .from('agent_tasks')
      .select('project_id')
      .in('assigned_to', teammateIds)
      .in('status', ['assigned', 'accepted', 'in_progress', 'awaiting_review', 'completed'])
      .not('scheduled_date', 'is', null)
      .not('project_id', 'is', null);
    if (pidErr) return NextResponse.json({ error: pidErr.message }, { status: 500 });
    projectIds = Array.from(
      new Set((pidRows ?? []).map((r) => r.project_id as string).filter(Boolean))
    );
  }

  let projects: Array<{ id: string; name: string; logoUrl: string | null; teamId: string | null }> = [];
  if (projectIds.length > 0) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, logo_url, team_id')
      .in('id', projectIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    projects = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      logoUrl: (r.logo_url as string | null) ?? null,
      teamId: (r.team_id as string | null) ?? null,
    }));
  }

  // CR-01: strip personalized columns at the route boundary. Personalized
  // text is only served by the viewer-discriminated route at
  // /api/recgon/tasks/[id]; the cross-team personal calendar must never
  // leak it (calendar can return tasks the viewer is NOT the assignee of
  // in edge cases — defense in depth).
  const sanitizedTasks = tasks.map((t) => {
    const { personalizedDescription: _pd, personalizedDescriptionForUserId: _pdfu, ...rest } = t;
    void _pd;
    void _pdfu;
    return rest;
  });
  return NextResponse.json({ tasks: sanitizedTasks, teams, projects });
}
