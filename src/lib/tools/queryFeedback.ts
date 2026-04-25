import { z } from 'zod';
import { analyzeFeedback } from '../feedbackEngine';
import { saveFeedbackToProject, generateId } from '../storage';
import { buildProjectAppContext } from '../appContext';
import { enqueueJob } from '../llm/jobQueue';
import { isRecoverable } from '../llm/utils';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID this feedback belongs to.'),
  feedback: z
    .array(z.string())
    .min(1)
    .describe('List of feedback items to analyze. Each item is one user comment, review, or support message.'),
});

type Input = z.infer<typeof parameters>;

interface FeedbackOutput {
  projectName: string;
  status: 'completed' | 'queued';
  summary?: string;
  sentiment?: string;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  themes?: string[];
  topFeatureRequests?: string[];
  topBugs?: string[];
  praises?: string[];
  developerPrompts?: string[];
  jobId?: string;
}

export const queryFeedbackTool: ToolDefinition<Input, FeedbackOutput> = {
  name: 'query_feedback',
  description:
    'Analyze a batch of user feedback items and extract sentiment, themes, feature requests, bugs, and actionable developer prompts. Saves the result to the project. Call this when the user pastes user feedback, reviews, or support messages.',
  parameters,
  summarize: (_input, output) =>
    output.status === 'queued'
      ? `${output.projectName}: feedback analysis queued`
      : `${output.projectName}: ${output.sentiment} sentiment, ${output.themes?.length ?? 0} themes`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);

    let result;
    try {
      result = await analyzeFeedback(input.feedback, buildProjectAppContext(project));
    } catch (err) {
      if (!isRecoverable(err)) throw err;
      const job = await enqueueJob({
        teamId: ctx.teamId,
        userId: ctx.userId,
        kind: 'feedback_analysis',
        payload: { feedback: input.feedback, projectId: project.id, teamId: ctx.teamId },
      });
      return {
        projectName: project.name,
        status: 'queued',
        jobId: job.id,
      };
    }

    const saved = await saveFeedbackToProject(
      project.id,
      {
        id: generateId(),
        rawFeedback: input.feedback,
        sentiment: result.overallSentiment,
        summary: result.summary,
        sentimentBreakdown: result.sentimentBreakdown,
        themes: result.themes,
        featureRequests: result.featureRequests,
        bugs: result.bugs,
        praises: result.praises,
        developerPrompts: result.developerPrompts,
        analyzedAt: new Date().toISOString(),
      },
      ctx.teamId,
    );
    if (!saved) throw new Error('Failed to save feedback analysis.');

    return {
      projectName: project.name,
      status: 'completed',
      summary: result.summary,
      sentiment: result.overallSentiment,
      sentimentBreakdown: result.sentimentBreakdown,
      themes: result.themes,
      topFeatureRequests: result.featureRequests.slice(0, 5),
      topBugs: result.bugs.slice(0, 5),
      praises: result.praises.slice(0, 3),
      developerPrompts: result.developerPrompts.slice(0, 5),
    };
  },
};
