import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

function isInsightOnlySourceRef(ref: unknown): boolean {
  return Boolean(ref && typeof ref === 'object' && (ref as { kind?: unknown }).kind === 'top_risk');
}

// Lightweight count for the nav badge. Returns count + latestAt so the
// client can decide "is there something new since the user last looked"
// without paging the whole task list.
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ count: 0, latestAt: null });

  const { data: teammates, error: tmErr } = await supabase
    .from('teammates')
    .select('id')
    .eq('user_id', session.user.id)
    .neq('status', 'retired');
  // Soft-fail on query errors: this backs a nav badge, so a wrong 0 beats
  // breaking the shell — but the failure must be visible in logs.
  if (tmErr) {
    logger.error('inbox count: teammates query failed', tmErr);
    return NextResponse.json({ count: 0, latestAt: null });
  }
  const ids = (teammates ?? []).map((t) => t.id);
  if (ids.length === 0) return NextResponse.json({ count: 0, latestAt: null });

  const { data, error: taskErr } = await supabase
    .from('agent_tasks')
    .select('id, assigned_at, source_ref')
    .in('assigned_to', ids)
    .in('status', ['assigned', 'accepted', 'in_progress'])
    .order('assigned_at', { ascending: false })
    .limit(100);
  if (taskErr) {
    logger.error('inbox count: tasks query failed', taskErr);
    return NextResponse.json({ count: 0, latestAt: null });
  }

  const actionTasks = (data ?? []).filter((t) => !isInsightOnlySourceRef(t.source_ref));

  return NextResponse.json({
    count: actionTasks.length,
    latestAt: actionTasks[0]?.assigned_at ?? null,
  });
}
