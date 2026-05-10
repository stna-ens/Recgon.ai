import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/apiError';

// In-flight LLM jobs for the v2 home "AI Work Lane".
// Returns only `pending` or `running` jobs so the UI lights up exactly what
// the autonomous worker is currently chewing through.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const { data, error } = await supabase
      .from('llm_jobs')
      .select('id, kind, status, created_at, locked_at')
      .eq('team_id', teamId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const now = Date.now();
    const jobs = (data ?? []).map((row) => {
      const createdAt = row.created_at as string;
      const ageSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
      return {
        id: row.id as string,
        kind: row.kind as string,
        status: row.status as 'pending' | 'running',
        createdAt,
        ageSeconds,
      };
    });

    return NextResponse.json({ jobs });
  } catch (err) {
    return serverError('GET /api/overview/jobs', err);
  }
}
