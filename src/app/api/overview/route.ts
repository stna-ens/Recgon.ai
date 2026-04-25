import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getAllProjects } from '@/lib/storage';
import { getRecentActivities } from '@/lib/activityLog';
import { serverError } from '@/lib/apiError';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SIGNAL_LABELS: Record<string, string> = {
  analyze_code: 'analysis completed',
  query_feedback: 'feedback analyzed',
  collect_feedback: 'feedback collected',
  generate_content: 'content generated',
  generate_campaign: 'campaign planned',
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
      getAllProjects(teamId, session.user.id),
      getRecentActivities(teamId, { sinceHours: 7 * 24, limit: 30 }),
    ]);

    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

    const signals = activities
      .filter((a) => a.status === 'succeeded' && SIGNAL_LABELS[a.toolName])
      .filter((a) => !a.projectId || projectMap[a.projectId])
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        label: SIGNAL_LABELS[a.toolName],
        projectName: a.projectId ? (projectMap[a.projectId] ?? null) : null,
        createdAt: a.createdAt,
      }));

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
        developerPrompts?: string[];
        result?: { developerPrompts?: string[] };
        analyzedAt?: string;
        createdAt?: string;
      }> | undefined;

      if (feedbackAnalyses && feedbackAnalyses.length > 0) {
        const latest = feedbackAnalyses[0];
        const latestAt = latest.analyzedAt ?? latest.createdAt ?? null;
        const developerPrompts = latest.developerPrompts ?? latest.result?.developerPrompts ?? [];
        for (const prompt of developerPrompts.slice(0, 2)) {
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

    const priorityOrder = { high: 0, med: 1, low: 2 };

    const projectBestPriority = new Map<string, number>();
    const projectFirstIdx = new Map<string, number>();
    actions.forEach((a, idx) => {
      const best = projectBestPriority.get(a.projectName);
      const p = priorityOrder[a.priority];
      if (best === undefined || p < best) projectBestPriority.set(a.projectName, p);
      if (!projectFirstIdx.has(a.projectName)) projectFirstIdx.set(a.projectName, idx);
    });

    actions.sort((a, b) => {
      const pa = projectBestPriority.get(a.projectName)!;
      const pb = projectBestPriority.get(b.projectName)!;
      if (pa !== pb) return pa - pb;
      if (a.projectName !== b.projectName) {
        return projectFirstIdx.get(a.projectName)! - projectFirstIdx.get(b.projectName)!;
      }
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return NextResponse.json({
      actions: actions.slice(0, 5),
      signals,
      unreadFeedback,
    });
  } catch (err) {
    return serverError('GET /api/overview', err);
  }
}
