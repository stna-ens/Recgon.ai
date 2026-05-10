import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getRecentActivities } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/apiError';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Maps the raw `activities.tool_name` token to a readable verb + the
// observability category it falls into. Categories drive the 14-day
// stacked chart legend.
type Category = 'analysis' | 'feedback' | 'content' | 'completion' | 'agent';
const TOOL_MAP: Record<string, { verb: string; category: Category }> = {
  analyze_code: { verb: 'analyzed codebase', category: 'analysis' },
  query_feedback: { verb: 'analyzed feedback', category: 'feedback' },
  collect_feedback: { verb: 'collected feedback', category: 'feedback' },
  generate_content: { verb: 'generated content', category: 'content' },
  generate_campaign: { verb: 'planned campaign', category: 'content' },
  fetch_analytics: { verb: 'refreshed analytics', category: 'analysis' },
  mark_item_complete: { verb: 'marked complete', category: 'completion' },
};

interface FeedItem {
  id: string;
  kind: 'analysis' | 'feedback' | 'content' | 'task_completed' | 'job_done' | 'agent';
  category: Category;
  verb: string;
  detail: string | null;
  projectId: string | null;
  projectName: string | null;
  occurredAt: string;
  status: 'ok' | 'fail' | 'info';
}

interface DayBucket {
  date: string;            // YYYY-MM-DD
  analysis: number;
  feedback: number;
  content: number;
  completion: number;
  agent: number;
  total: number;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const sinceIso = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();

    const [activities, completedTasksRes, projectsRes] = await Promise.all([
      // Pull a fat window so the 14-day chart has full coverage AND the
      // recent feed has enough material after filtering by category.
      getRecentActivities(teamId, { sinceHours: 14 * 24, limit: 200 }),
      supabase
        .from('agent_tasks')
        .select('id, title, project_id, completed_at')
        .eq('team_id', teamId)
        .eq('status', 'completed')
        .gte('completed_at', sinceIso)
        .order('completed_at', { ascending: false })
        .limit(40),
      supabase
        .from('projects')
        .select('id, name')
        .eq('team_id', teamId),
    ]);

    const projectMap = Object.fromEntries(
      (projectsRes.data ?? []).map((p) => [p.id as string, p.name as string]),
    );

    const feed: FeedItem[] = [];

    // Activities → feed events (only ones we have a reading for).
    for (const a of activities) {
      const map = TOOL_MAP[a.toolName];
      if (!map) continue;
      const projectName = a.projectId ? projectMap[a.projectId] ?? null : null;
      const status: FeedItem['status'] =
        a.status === 'failed' ? 'fail' : a.status === 'succeeded' ? 'ok' : 'info';
      feed.push({
        id: `act-${a.id}`,
        kind: map.category === 'analysis' ? 'analysis'
            : map.category === 'feedback' ? 'feedback'
            : map.category === 'content'  ? 'content'
            : 'agent',
        category: map.category,
        verb: map.verb,
        detail: a.resultSummary ?? null,
        projectId: a.projectId ?? null,
        projectName,
        occurredAt: a.createdAt,
        status,
      });
    }

    // Completed agent tasks → feed events.
    for (const row of completedTasksRes.data ?? []) {
      const completedAt = row.completed_at as string | null;
      if (!completedAt) continue;
      const pid = row.project_id as string | null;
      feed.push({
        id: `task-${row.id as string}`,
        kind: 'task_completed',
        category: 'completion',
        verb: 'shipped',
        detail: row.title as string,
        projectId: pid,
        projectName: pid ? (projectMap[pid] ?? null) : null,
        occurredAt: completedAt,
        status: 'ok',
      });
    }

    feed.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    // 14-day buckets — from oldest to newest, dense (zero-fill empty days).
    const buckets: DayBucket[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * ONE_DAY_MS);
      buckets.push({
        date: d.toISOString().slice(0, 10),
        analysis: 0,
        feedback: 0,
        content: 0,
        completion: 0,
        agent: 0,
        total: 0,
      });
    }
    const firstBucketStart = today.getTime() - 13 * ONE_DAY_MS;
    for (const item of feed) {
      const t = new Date(item.occurredAt).getTime();
      if (t < firstBucketStart) continue;
      const idx = Math.floor((t - firstBucketStart) / ONE_DAY_MS);
      if (idx < 0 || idx >= buckets.length) continue;
      const b = buckets[idx];
      b[item.category]++;
      b.total++;
    }

    const lastActivityAt = feed[0]?.occurredAt ?? null;

    return NextResponse.json({
      feed: feed.slice(0, 25),
      buckets,
      lastActivityAt,
      totalEvents: feed.length,
    });
  } catch (err) {
    return serverError('GET /api/overview/activity', err);
  }
}
