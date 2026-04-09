import { NextRequest, NextResponse } from 'next/server';
import { analyzeFeedback } from '@/lib/feedbackEngine';
import { validateEnv } from '@/lib/env';
import { isRateLimited, FEEDBACK_LIMIT } from '@/lib/rateLimit';
import { saveFeedbackToProject, generateId } from '@/lib/storage';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (await isRateLimited(`feedback:${ip}`, FEEDBACK_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { feedback, projectId, teamId } = body as { feedback: string[]; projectId?: string; teamId?: string };

    if (!feedback || !Array.isArray(feedback) || feedback.length === 0) {
      return NextResponse.json(
        { error: 'feedback must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    validateEnv();
    logger.debug('analyzing feedback', { count: feedback.length });
    const result = await analyzeFeedback(feedback);
    logger.debug('feedback analysis complete');

    if (projectId && teamId) {
      const session = await auth();
      if (session?.user?.id) {
        const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
        if (hasWrite) {
          const analysis = {
            id: generateId(),
            rawFeedback: feedback,
            sentiment: result.overallSentiment,
            sentimentBreakdown: result.sentimentBreakdown,
            themes: result.themes,
            featureRequests: result.featureRequests,
            bugs: result.bugs,
            praises: result.praises,
            developerPrompts: result.developerPrompts,
            analyzedAt: new Date().toISOString(),
          };
          await saveFeedbackToProject(projectId, analysis, teamId);
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return serverError('POST /api/feedback/analyze', error);
  }
}
