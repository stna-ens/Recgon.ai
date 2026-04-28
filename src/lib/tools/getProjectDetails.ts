import { z } from 'zod';
import type { ToolDefinition } from './types';
import { resolveProject } from './resolveProject';

const parameters = z.object({
  project: z.string().min(1).describe(
    'REQUIRED. The project name the user is asking about (e.g. "Recgon.ai"). Partial matches and UUIDs both work. Never omit this — every call must include a project name.',
  ),
});

type Input = z.infer<typeof parameters>;

export const getProjectDetailsTool: ToolDefinition<Input, Record<string, unknown>> = {
  name: 'get_project_details',
  description:
    'Fetch full stored data for ONE project — recent feedback analyses, campaigns, and marketing content. Always pass the project name in the `project` argument. Use when the user asks to see existing feedback, campaigns, or content for a specific project.',
  parameters,
  summarize: (_input, output) => `project ${(output as { name?: string }).name ?? 'unknown'}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    const feedbackAnalyses = project.feedbackAnalyses?.slice(0, 3) ?? [];
    const campaigns = project.campaigns?.slice(0, 3) ?? [];
    const marketingContent = project.marketingContent?.slice(0, 3) ?? [];
    return {
      id: project.id,
      name: project.name,
      sourceType: project.sourceType,
      description: project.description ?? null,
      githubUrl: project.githubUrl ?? null,
      analyticsPropertyId: project.analyticsPropertyId ?? null,
      analysis: project.analysis ?? null,
      feedbackAnalyses,
      campaigns,
      marketingContent,
      counts: {
        feedbackAnalyses: project.feedbackAnalyses?.length ?? 0,
        campaigns: project.campaigns?.length ?? 0,
        marketingContent: project.marketingContent?.length ?? 0,
      },
    };
  },
};
