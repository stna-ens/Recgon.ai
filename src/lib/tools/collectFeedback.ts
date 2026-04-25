import { z } from 'zod';
import { analyzeFeedback } from '../feedbackEngine';
import {
  buildFeedbackAnalysisRecord,
  collectFeedbackFromSources,
  feedbackAnalysisToResult,
  sameFeedbackSet,
} from '../feedbackWorkspace';
import { saveFeedbackToProject } from '../storage';
import { buildProjectAppContext } from '../appContext';
import { enqueueJob } from '../llm/jobQueue';
import { isRecoverable } from '../llm/utils';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID whose configured feedback sources should be collected.'),
});

type Input = z.infer<typeof parameters>;

interface CollectFeedbackOutput {
  projectName: string;
  status: 'completed' | 'not_modified' | 'empty' | 'queued';
  summary?: string;
  rawFeedbackCount: number;
  themes: string[];
  warnings: string[];
  jobId?: string;
}

export const collectFeedbackTool: ToolDefinition<Input, CollectFeedbackOutput> = {
  name: 'collect_feedback',
  description:
    'Collect feedback from a project’s configured source profiles, analyze it, and save the feedback analysis so it appears on the Feedback page. Call this when the user asks to collect, refresh, or analyze feedback from existing sources.',
  parameters,
  summarize: (_input, output) =>
    `${output.projectName}: ${output.status}, ${output.rawFeedbackCount} feedback items`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    const sources = project.socialProfiles ?? [];
    if (sources.length === 0) {
      throw new Error(`${project.name} has no feedback sources configured.`);
    }

    const latest = project.feedbackAnalyses?.[0] ?? null;
    const { feedback, warnings } = await collectFeedbackFromSources(sources);

    if (feedback.length === 0) {
      const result = latest ? feedbackAnalysisToResult(latest) : null;
      return {
        projectName: project.name,
        status: 'empty',
        summary: result?.summary,
        rawFeedbackCount: 0,
        themes: result?.themes ?? [],
        warnings,
      };
    }

    if (latest && sameFeedbackSet(latest.rawFeedback, feedback)) {
      const result = feedbackAnalysisToResult(latest);
      return {
        projectName: project.name,
        status: 'not_modified',
        summary: result.summary,
        rawFeedbackCount: feedback.length,
        themes: result.themes,
        warnings,
      };
    }

    let result;
    try {
      result = await analyzeFeedback(feedback, buildProjectAppContext(project));
    } catch (err) {
      if (!isRecoverable(err)) throw err;
      const job = await enqueueJob({
        teamId: ctx.teamId,
        userId: ctx.userId,
        kind: 'feedback_analysis',
        payload: { feedback, projectId: project.id, teamId: ctx.teamId },
      });
      return {
        projectName: project.name,
        status: 'queued',
        rawFeedbackCount: feedback.length,
        themes: [],
        warnings,
        jobId: job.id,
      };
    }

    const analysis = buildFeedbackAnalysisRecord(result, feedback);
    const saved = await saveFeedbackToProject(project.id, analysis, ctx.teamId);
    if (!saved) throw new Error('Failed to save collected feedback analysis.');

    return {
      projectName: project.name,
      status: 'completed',
      summary: result.summary,
      rawFeedbackCount: feedback.length,
      themes: result.themes,
      warnings,
    };
  },
};
