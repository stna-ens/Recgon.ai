import { z } from 'zod';
import { getProject } from '../storage';
import type { ToolDefinition } from './types';

const parameters = z.object({
  projectId: z.string().describe('ID of the project to fetch. Call list_projects first if you do not know it.'),
});

type Input = z.infer<typeof parameters>;

export const getProjectDetailsTool: ToolDefinition<Input, Record<string, unknown>> = {
  name: 'get_project_details',
  description:
    'Fetch the full stored analysis for a specific project: product description, tech stack, SWOT, prioritized next steps, GA4 property id, recent feedback analyses, and campaigns. Use this before answering detailed questions about a project.',
  parameters,
  summarize: (input) => `project ${input.projectId}`,
  handler: async (input, ctx) => {
    const project = await getProject(input.projectId, ctx.teamId);
    if (!project) throw new Error(`Project ${input.projectId} not found in this team`);
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
