import { z } from 'zod';
import type { ToolDefinition } from './types';
import { resolveProject } from './resolveProject';

const parameters = z.object({
  project: z.string().describe(
    'The project name (as the user refers to it). Partial matches work. UUIDs also accepted but not required.',
  ),
});

type Input = z.infer<typeof parameters>;

export const getProjectDetailsTool: ToolDefinition<Input, Record<string, unknown>> = {
  name: 'get_project_details',
  description:
    'Fetch the full stored data for a specific project — including recent feedback analyses, campaigns, and marketing content. Only call this when you need data NOT already in the system prompt (e.g. the user asks about recent feedback, campaigns, or marketing content). Do NOT call this for general project questions — those are already answered by the project summary in the system prompt.',
  parameters,
  summarize: (_input, output) => `project ${(output as { name?: string }).name ?? 'unknown'}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    return {
      id: project.id,
      name: project.name,
      sourceType: project.sourceType,
      description: project.description,
      githubUrl: project.githubUrl,
      analyticsPropertyId: project.analyticsPropertyId,
      analysis: project.analysis,
      feedbackAnalyses: project.feedbackAnalyses?.slice(0, 3),
      campaigns: project.campaigns?.slice(0, 3),
      marketingContent: project.marketingContent?.slice(0, 3),
    };
  },
};
