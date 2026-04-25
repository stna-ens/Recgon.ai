import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { serverError } from '@/lib/apiError';
import { validateEnv } from '@/lib/env';
import { analyzeFeedback } from '@/lib/feedbackEngine';
import {
  buildFeedbackAnalysisRecord,
  collectFeedbackFromSources,
  feedbackAnalysisToResult,
  sameFeedbackSet,
} from '@/lib/feedbackWorkspace';
import { isRecoverable } from '@/lib/llm/utils';
import { enqueueJob } from '@/lib/llm/jobQueue';
import { logger } from '@/lib/logger';
import { FEEDBACK_LIMIT, isRateLimited } from '@/lib/rateLimit';
import { getProject, saveFeedbackToProject } from '@/lib/storage';
import { verifyTeamAccess, verifyTeamWriteAccess } from '@/lib/teamStorage';
import { buildProjectAppContext } from '@/lib/appContext';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, teamId } = body as { projectId?: string; teamId?: string };

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }
    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    const role = await verifyTeamAccess(teamId, session.user.id);
    if (!role) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const rateKey = `feedback-collect:team:${teamId}`;
    if (await isRateLimited(rateKey, FEEDBACK_LIMIT)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    const project = await getProject(projectId, teamId, session.user.id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const sources = project.socialProfiles ?? [];
    if (sources.length === 0) {
      return NextResponse.json({ error: 'No feedback sources configured for this project.' }, { status: 400 });
    }

    const latest = project.feedbackAnalyses?.[0] ?? null;
    const { feedback, summaries, warnings } = await collectFeedbackFromSources(sources);

    if (feedback.length === 0) {
      return NextResponse.json({
        status: 'empty',
        result: latest ? feedbackAnalysisToResult(latest) : null,
        message: latest
          ? 'No new feedback-like content was extracted. Showing the latest saved analysis.'
          : 'No feedback-like content was extracted from the configured sources.',
        rawFeedbackCount: 0,
        sourceSummaries: summaries,
        warnings,
      });
    }

    if (latest && sameFeedbackSet(latest.rawFeedback, feedback)) {
      return NextResponse.json({
        status: 'not_modified',
        result: feedbackAnalysisToResult(latest),
        message: 'No new feedback found. Showing the latest saved analysis.',
        rawFeedbackCount: feedback.length,
        sourceSummaries: summaries,
        warnings,
      });
    }

    validateEnv();
    const canWrite = await verifyTeamWriteAccess(teamId, session.user.id);
    const appContext = buildProjectAppContext(project);

    try {
      const result = await analyzeFeedback(feedback, appContext);
      const analysis = buildFeedbackAnalysisRecord(result, feedback);

      if (canWrite) {
        await saveFeedbackToProject(projectId, analysis, teamId);
      }

      return NextResponse.json({
        status: 'completed',
        result,
        saved: canWrite,
        message: canWrite
          ? 'Collected fresh feedback and saved a new analysis.'
          : 'Collected fresh feedback. You do not have permission to save it to the project.',
        rawFeedbackCount: feedback.length,
        sourceSummaries: summaries,
        warnings,
      });
    } catch (err) {
      if (!isRecoverable(err) || !canWrite) {
        throw err;
      }

      const job = await enqueueJob({
        teamId,
        userId: session.user.id,
        kind: 'feedback_analysis',
        payload: { feedback, projectId, teamId },
      });
      logger.warn('feedback collection enqueued due to provider overload', { jobId: job.id, projectId });
      return NextResponse.json(
        {
          status: 'queued',
          jobId: job.id,
          message: 'Fresh feedback was collected and the analysis has been queued. Check back in a minute.',
          rawFeedbackCount: feedback.length,
          sourceSummaries: summaries,
          warnings,
        },
        { status: 202 },
      );
    }
  } catch (error) {
    return serverError('POST /api/feedback/collect', error);
  }
}
