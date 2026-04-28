import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getAllProjects } from '@/lib/storage';
import { getAnalyticsConfig } from '@/lib/analyticsStorage';
import { fetchAnalyticsData } from '@/lib/analyticsEngine';
import { serverError } from '@/lib/apiError';
import { getRecentActivities } from '@/lib/activityLog';

type AnalyticsDelta = { projectName: string; sessionsCurrent: number; sessionsPrevious: number; deltaPct: number };
const analyticsCache = new Map<string, { deltas: AnalyticsDelta[]; expiresAt: number }>();
const ANALYTICS_TTL_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const projects = await getAllProjects(teamId, session.user.id);
    if (projects.length === 0) {
      return NextResponse.json({ analytics: [], analyticsConfigured: false });
    }

    const scope = { kind: 'team' as const, teamId };
    const config = await getAnalyticsConfig(scope);
    const hasAuth = !!config && (config.authMethod === 'oauth' ? !!config.oauth : !!config.serviceAccountJson);

    if (!hasAuth || !config) {
      return NextResponse.json({ analytics: [], analyticsConfigured: false });
    }

    const authOptions = config.authMethod === 'oauth' && config.oauth
      ? { oauth: config.oauth, scope }
      : { serviceAccountJson: config.serviceAccountJson };

    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
    const recentAnalyticsActivity = (await getRecentActivities(teamId, { sinceHours: 7 * 24, limit: 20 }))
      .find((a) => (
        a.status === 'succeeded'
        && a.toolName === 'fetch_analytics'
        && (!a.projectId || projectMap[a.projectId])
      ));
    const fingerprint = projects
      .map((p) => `${p.id}:${p.analyticsPropertyId ?? config.propertyId ?? ''}`)
      .join('|');
    const cacheKey = `${teamId}:${session.user.id}:${fingerprint}:${recentAnalyticsActivity?.createdAt ?? ''}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ analytics: cached.deltas, analyticsConfigured: true });
    }

    const byProperty = new Map<string, string[]>();
    for (const p of projects) {
      const pid = p.analyticsPropertyId || config.propertyId;
      if (!pid || !/^\d+$/.test(pid)) continue;
      if (!byProperty.has(pid)) byProperty.set(pid, []);
      byProperty.get(pid)!.push(p.name);
    }

    const results = await Promise.all(
      [...byProperty.entries()].map(async ([propertyId, names]) => {
        try {
          const data = await fetchAnalyticsData(propertyId, authOptions, 14);
          const trend = data.trend;
          if (trend.length < 2) return null;
          const half = Math.floor(trend.length / 2);
          const prior = trend.slice(0, half);
          const current = trend.slice(-half);
          const sum = (arr: typeof trend) => arr.reduce((s, d) => s + d.sessions, 0);
          const sessionsPrevious = sum(prior);
          const sessionsCurrent = sum(current);
          const deltaPct = sessionsPrevious > 0
            ? Math.round(((sessionsCurrent - sessionsPrevious) / sessionsPrevious) * 100)
            : 0;
          const label = names.length <= 3 ? names.join(' · ') : `${names[0]} +${names.length - 1}`;
          return { projectName: label, sessionsCurrent, sessionsPrevious, deltaPct };
        } catch (err) {
          console.error(`[overview/analytics] fetch failed for propertyId=${propertyId}:`, err);
          return null;
        }
      }),
    );
    const deltas = results.filter((r): r is AnalyticsDelta => r !== null);
    analyticsCache.set(cacheKey, { deltas, expiresAt: Date.now() + ANALYTICS_TTL_MS });

    return NextResponse.json({ analytics: deltas, analyticsConfigured: true });
  } catch (err) {
    return serverError('GET /api/overview/analytics', err);
  }
}
