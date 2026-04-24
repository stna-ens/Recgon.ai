import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getAllProjects } from '@/lib/storage';
import { OVERVIEW_BRIEF_SYSTEM, overviewBriefUserPrompt } from '@/lib/prompts';
import { serverError } from '@/lib/apiError';
import { OverviewBriefSchema } from '@/lib/schemas';
import { generateStructuredOutput } from '@/lib/llm/quality';

const briefCache = new Map<string, { brief: { brief: string; focusArea: string }; expiresAt: number }>();
const BRIEF_TTL_MS = 2 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const cached = briefCache.get(teamId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ brief: cached.brief });
    }

    const projects = await getAllProjects(teamId);
    const analyzedProjects = projects.filter((p) => p.analysis);

    if (analyzedProjects.length === 0) {
      return NextResponse.json({ brief: null });
    }

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
      const parsed = await generateStructuredOutput({
        taskKind: 'overview_brief',
        schema: OverviewBriefSchema,
        systemPrompt: OVERVIEW_BRIEF_SYSTEM,
        userPrompt: overviewBriefUserPrompt(briefInput),
        options: { temperature: 0.5, maxTokens: 4096 },
        qualityProfile: 'brief',
      });
      briefCache.set(teamId, { brief: parsed, expiresAt: Date.now() + BRIEF_TTL_MS });
      return NextResponse.json({ brief: parsed });
    } catch (err) {
      console.error('[overview/brief] generation failed:', err);
      return NextResponse.json({ brief: null });
    }
  } catch (err) {
    return serverError('GET /api/overview/brief', err);
  }
}
