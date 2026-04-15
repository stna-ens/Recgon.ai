import { z } from 'zod';
import { analyzeFeedback } from '../feedbackEngine';
import { saveFeedbackToProject, generateId } from '../storage';
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
  sentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  topFeatureRequests: string[];
  topBugs: string[];
  praises: string[];
  developerPrompts: string[];
}

export const queryFeedbackTool: ToolDefinition<Input, FeedbackOutput> = {
  name: 'query_feedback',
  description:
    'Analyze a batch of user feedback items and extract sentiment, themes, feature requests, bugs, and actionable developer prompts. Saves the result to the project. Call this when the user pastes user feedback, reviews, or support messages.',
  parameters,
  summarize: (_input, output) =>
    `${output.projectName}: ${output.sentiment} sentiment, ${output.themes.length} themes`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId);
    const result = await analyzeFeedback(input.feedback);

    await saveFeedbackToProject(
      project.id,
      {
        id: generateId(),
        rawFeedback: input.feedback,
        sentiment: result.overallSentiment,
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

    return {
      projectName: project.name,
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
