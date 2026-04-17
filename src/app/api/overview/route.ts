import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getAllProjects } from '@/lib/storage';
import { getRecentActivities } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { chat } from '@/lib/gemini';
import { OVERVIEW_BRIEF_SYSTEM, overviewBriefUserPrompt } from '@/lib/prompts';
import { serverError } from '@/lib/apiError';
import { getAnalyticsConfig } from '@/lib/analyticsStorage';
import { fetchAnalyticsData } from '@/lib/analyticsEngine';

// ── In-process brief cache (per team, 2-hour TTL) ────────────────────────────
const briefCache = new Map<string, { brief: { brief: string; focusArea: string }; expiresAt: number }>();
const BRIEF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Analytics delta cache (per team, 30-min TTL) ─────────────────────────────
type AnalyticsDelta = { projectName: string; sessionsCurrent: number; sessionsPrevious: number; deltaPct: number };
const analyticsCache = new Map<string, { deltas: AnalyticsDelta[]; expiresAt: number }>();
const ANALYTICS_TTL_MS = 30 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Only domain-signal events — audit-trail style tool calls are filtered out.
const SIGNAL_LABELS: Record<string, string> = {
  analyze_code: 'analysis completed',
  query_feedback: 'feedback analyzed',
  generate_content: 'content generated',
  fetch_analytics: 'analytics refreshed',
  mark_item_complete: 'action marked complete',
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const [projects, activities] = await Promise.all([
      getAllProjects(teamId),
      getRecentActivities(teamId, { sinceHours: 7 * 24, limit: 30 }),
    ]);

    // ── Resolve user names for activity feed ──────────────────────────────────
    const userIds = [...new Set(activities.map((a) => a.userId))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, nickname, email')
        .in('id', userIds);
      if (users) {
        userMap = Object.fromEntries(
          users.map((u: { id: string; nickname: string; email: string }) => [
            u.id,
            u.nickname || u.email.split('@')[0],
          ])
        );
      }
    }

    // ── Resolve project names for activity feed ───────────────────────────────
    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

    // ── Build recent signals (domain events only, succeeded) ──────────────────
    const signals = activities
      .filter((a) => a.status === 'succeeded' && SIGNAL_LABELS[a.toolName])
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        label: SIGNAL_LABELS[a.toolName],
        projectName: a.projectId ? (projectMap[a.projectId] ?? null) : null,
        createdAt: a.createdAt,
      }));

    // ── Build priority actions from analyses + feedback ───────────────────────
    type Action = {
      id: string;
      title: string;
      source: 'analysis' | 'feedback';
      projectName: string;
      priority: 'high' | 'med' | 'low';
      surfacedAt: string | null;
    };

    const actions: Action[] = [];
    let unreadFeedback = 0;
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;

    for (const project of projects) {
      const analysis = project.analysis as {
        overallScore?: number;
        analyzedAt?: string;
        prioritizedNextSteps?: string[];
        swot?: { weaknesses?: string[] };
      } | undefined;

      if (analysis?.prioritizedNextSteps) {
        const score = analysis.overallScore ?? 10;
        const priority: Action['priority'] = score < 5 ? 'high' : score < 7 ? 'med' : 'low';
        for (const step of analysis.prioritizedNextSteps.slice(0, 3)) {
          actions.push({
            id: `${project.id}-step-${actions.length}`,
            title: step,
            source: 'analysis',
            projectName: project.name,
            priority,
            surfacedAt: analysis.analyzedAt ?? null,
          });
        }
      }

      const feedbackAnalyses = project.feedbackAnalyses as Array<{
        result?: { developerPrompts?: string[] };
        analyzedAt?: string;
        createdAt?: string;
      }> | undefined;

      if (feedbackAnalyses && feedbackAnalyses.length > 0) {
        const latest = feedbackAnalyses[feedbackAnalyses.length - 1];
        const latestAt = latest.analyzedAt ?? latest.createdAt ?? null;
        for (const prompt of (latest.result?.developerPrompts ?? []).slice(0, 2)) {
          actions.push({
            id: `${project.id}-fb-${actions.length}`,
            title: prompt,
            source: 'feedback',
            projectName: project.name,
            priority: 'med',
            surfacedAt: latestAt,
          });
        }

        for (const fb of feedbackAnalyses) {
          const at = fb.analyzedAt ?? fb.createdAt;
          if (at && new Date(at).getTime() >= sevenDaysAgo) unreadFeedback++;
        }
      }
    }

    // Sort: high → med → low
    const priorityOrder = { high: 0, med: 1, low: 2 };
    actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // ── Generate CEO brief via Gemini (cached per team, 2h TTL) ──────────────
    let brief: { brief: string; focusArea: string } | null = null;

    const cached = briefCache.get(teamId);
    if (cached && cached.expiresAt > Date.now()) {
      brief = cached.brief;
    }

    const analyzedProjects = projects.filter((p) => p.analysis);

    if (!brief && analyzedProjects.length > 0) {
      const briefInput = analyzedProjects.map((p) => {
        const analysis = p.analysis as {
          currentStage?: string;
          swot?: { weaknesses?: string[] };
          prioritizedNextSteps?: string[];
        } | undefined;
        const feedbackAnalyses = p.feedbackAnalyses as Array<{
          result?: { themes?: string[] };
        }> | undefined;
        const latestFeedback = feedbackAnalyses?.[feedbackAnalyses.length - 1];
        return {
          name: p.name,
          stage: analysis?.currentStage ?? null,
          weaknesses: analysis?.swot?.weaknesses?.slice(0, 2) ?? [],
          nextSteps: analysis?.prioritizedNextSteps?.slice(0, 2) ?? [],
          feedbackThemes: latestFeedback?.result?.themes?.slice(0, 2) ?? [],
          marketingCount: (p.marketingContent as unknown[])?.length ?? 0,
          feedbackCount: feedbackAnalyses?.length ?? 0,
        };
      });

      try {
        const raw = await chat(OVERVIEW_BRIEF_SYSTEM, overviewBriefUserPrompt(briefInput), { temperature: 0.5, maxTokens: 4096 });
        const sanitized = raw.replace(/[\r\n]+/g, ' ').trim();
        const parsed = JSON.parse(sanitized);
        briefCache.set(teamId, { brief: parsed, expiresAt: Date.now() + BRIEF_TTL_MS });
        brief = parsed;
      } catch (err) {
        console.error('[overview] brief generation failed:', err);
      }
    }

    // ── Analytics deltas (7d vs prior 7d, per connected project) ──────────────
    let analyticsDeltas: AnalyticsDelta[] = [];
    const analyticsCached = analyticsCache.get(teamId);
    if (analyticsCached && analyticsCached.expiresAt > Date.now()) {
      analyticsDeltas = analyticsCached.deltas;
    } else {
      const connected = projects.filter((p) => p.analyticsPropertyId);
      if (connected.length > 0) {
        const config = await getAnalyticsConfig(session.user.id);
        if (config && (config.authMethod === 'oauth' ? !!config.oauth : !!config.serviceAccountJson)) {
          const authOptions = config.authMethod === 'oauth' && config.oauth
            ? { oauth: config.oauth, userId: session.user.id }
            : { serviceAccountJson: config.serviceAccountJson };

          const results = await Promise.all(
            connected.map(async (p) => {
              try {
                const data = await fetchAnalyticsData(p.analyticsPropertyId!, authOptions, 14);
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
                return { projectName: p.name, sessionsCurrent, sessionsPrevious, deltaPct };
              } catch (err) {
                console.error(`[overview] analytics fetch failed for ${p.name}:`, err);
                return null;
              }
            }),
          );
          analyticsDeltas = results.filter((r): r is AnalyticsDelta => r !== null);
          analyticsCache.set(teamId, { deltas: analyticsDeltas, expiresAt: Date.now() + ANALYTICS_TTL_MS });
        }
      }
    }

    return NextResponse.json({
      brief,
      actions: actions.slice(0, 5),
      signals,
      unreadFeedback,
      analytics: analyticsDeltas,
    });
  } catch (err) {
    return serverError('GET /api/overview', err);
  }
}
