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
    'Fetch the full stored analysis for a specific project: product description, tech stack, SWOT, prioritized next steps, GA4 property id, recent feedback analyses, and campaigns. Use this before answering detailed questions about a project. Pass the project name exactly as the user says it — no UUID needed.',
  parameters,
  summarize: (_input, output) => `project ${(output as { name?: string }).name ?? 'unknown'}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId);
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
