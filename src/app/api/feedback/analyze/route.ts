import { NextRequest, NextResponse } from 'next/server';
import { analyzeFeedback } from '@/lib/feedbackEngine';
import { validateEnv } from '@/lib/env';
import { isRateLimited, FEEDBACK_LIMIT } from '@/lib/rateLimit';
import { saveFeedbackToProject, generateId } from '@/lib/storage';
import { auth } from '@/auth';
import { verifyTeamWriteAccess } from '@/lib/teamStorage';
import { serverError } from '@/lib/apiError';
import { logger } from '@/lib/logger';
import { isRecoverable } from '@/lib/llm/utils';
import { enqueueJob } from '@/lib/llm/jobQueue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { feedback, projectId, teamId } = body as { feedback: string[]; projectId?: string; teamId?: string };

    if (!feedback || !Array.isArray(feedback) || feedback.length === 0) {
      return NextResponse.json(
        { error: 'feedback must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    // Rate limit per team when scoped to a team; fall back to IP for unscoped
    // analyses (e.g. preview/playground calls without a saved project)
    const rateKey = teamId
      ? `feedback:team:${teamId}`
      : `feedback:ip:${request.headers.get('x-forwarded-for') ?? 'local'}`;
    if (await isRateLimited(rateKey, FEEDBACK_LIMIT)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    validateEnv();
    logger.debug('analyzing feedback', { count: feedback.length });

    // Inline-first: try to return the result in the request/response cycle.
    // If every LLM provider is overloaded or rate-limited, enqueue a job so
    // the cron drain can retry the analysis over a multi-hour window and
    // the user sees "queued" instead of a failure.
    try {
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
              summary: result.summary,
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
    } catch (err) {
      if (!isRecoverable(err)) throw err;

      // Falling back to the queue requires a signed-in user (we need a
      // user_id for the row). For anonymous playground calls we surface
      // the original error.
      const session = await auth();
      if (!session?.user?.id || !teamId) {
        throw err;
      }

      const hasWrite = await verifyTeamWriteAccess(teamId, session.user.id);
      if (!hasWrite) throw err;

      const job = await enqueueJob({
        teamId,
        userId: session.user.id,
        kind: 'feedback_analysis',
        payload: { feedback, projectId, teamId },
      });
      logger.warn('feedback enqueued due to provider overload', { jobId: job.id });
      return NextResponse.json(
        {
          status: 'queued',
          jobId: job.id,
          message: 'All AI providers are busy right now — your analysis is queued and will run automatically. Check back in a minute.',
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return serverError('POST /api/feedback/analyze', error);
  }
}
