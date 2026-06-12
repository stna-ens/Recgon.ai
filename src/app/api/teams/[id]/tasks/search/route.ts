import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { supabase } from '@/lib/supabase';

// Lightweight task search for the command palette and deep-link lookups.
// Explicit display columns ONLY (CR-01: no reasoning / personalized /
// description fields), title ilike, newest first, capped at 20.

const SEARCH_SELECT = 'id, title, kind, status, priority, project_id, assigned_to, created_at';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ tasks: [] });

  // Escape ilike wildcards so a literal % or _ in the query can't blow up
  // the match surface.
  const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);

  const { data, error } = await supabase
    .from('agent_tasks')
    .select(SEARCH_SELECT)
    .eq('team_id', teamId)
    .ilike('title', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tasks: data ?? [] });
}
