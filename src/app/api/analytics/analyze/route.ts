import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ANALYTICS_SYSTEM, analyticsUserPrompt } from '@/lib/prompts';
import { AnalyticsInsightsSchema } from '@/lib/schemas';
import { serverError } from '@/lib/apiError';
import { generateStructuredOutput } from '@/lib/llm/quality';
import { saveAnalyticsInsight } from '@/lib/analyticsInsightsStorage';
import { getProjectTeamId } from '@/lib/storage';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { logger } from '@/lib/logger';

function fallbackInsightsFromRaw(raw: string) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const summary = sentences[0] ?? 'Analytics summary generated, but structured insight formatting failed.';
  const keyInsights = sentences.slice(1, 4);
  const topWin = keyInsights[0] ?? 'Traffic and behavior data was fetched successfully.';

  return {
    overallPerformance: 'insufficient_data' as const,
    summary,
    keyInsights,
    warnings: ['The AI response format was degraded; showing a simplified summary.'],
    opportunities: sentences.slice(4, 6),
    recommendations: [
      'Re-run insights in 1-2 minutes for a fully structured report.',
      'Use the trend and channel charts to validate this summary before acting.',
    ],
    topWin,
    topConcern: 'Could not extract the full structured insight payload from the model response.',
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, days, projectId, teamId } = await req.json();
  if (!data) return NextResponse.json({ error: 'Missing analytics data' }, { status: 400 });

  try {
    let verifiedTeamId = teamId as string | undefined;
    if (projectId) {
      const owningTeamId = await getProjectTeamId(projectId);
      if (!owningTeamId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      verifiedTeamId = owningTeamId;
    }
    if (verifiedTeamId) {
      const role = await verifyTeamAccess(verifiedTeamId, session.user.id);
      if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const userPrompt = analyticsUserPrompt(data, days ?? 30);
    let insights;
    try {
      insights = await generateStructuredOutput({
        taskKind: 'analytics_insights',
        schema: AnalyticsInsightsSchema,
        systemPrompt: ANALYTICS_SYSTEM,
        userPrompt,
        options: { temperature: 0.5, maxTokens: 4096 },
        qualityProfile: 'analytics',
      });
    } catch {
      insights = fallbackInsightsFromRaw('Analytics summary generated, but structured insight formatting failed.');
    }
    if (verifiedTeamId && data.propertyId) {
      try {
        await saveAnalyticsInsight({
          projectId,
          teamId: verifiedTeamId,
          userId: session.user.id,
          propertyId: data.propertyId,
          days: days ?? 30,
          dateRange: data.dateRange,
          overview: data.overview ?? {},
          insights,
          rawData: data,
          source: 'gui',
        });
      } catch (saveErr) {
        logger.warn('failed to persist analytics insights', {
          projectId,
          err: saveErr instanceof Error ? saveErr.message : String(saveErr),
        });
      }
    }

    return NextResponse.json(insights);
  } catch (err) {
    return serverError('POST /api/analytics/analyze', err);
  }
}
