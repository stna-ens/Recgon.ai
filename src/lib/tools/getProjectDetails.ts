import { z } from 'zod';
import { getProject, getAllProjects } from '../storage';
import type { ToolDefinition } from './types';

const parameters = z.object({
  projectId: z.string().describe(
    'ID or name of the project to fetch. Prefer passing the UUID from list_projects, but a partial name match also works.',
  ),
});

type Input = z.infer<typeof parameters>;

export const getProjectDetailsTool: ToolDefinition<Input, Record<string, unknown>> = {
  name: 'get_project_details',
  description:
    'Fetch the full stored analysis for a specific project: product description, tech stack, SWOT, prioritized next steps, GA4 property id, recent feedback analyses, and campaigns. Use this before answering detailed questions about a project. You can pass either the project UUID or a partial name.',
  parameters,
  summarize: (input) => `project ${input.projectId}`,
  handler: async (input, ctx) => {
    // Try exact UUID lookup first
    let project = await getProject(input.projectId, ctx.teamId).catch(() => undefined);

    // Fall back to case-insensitive name match
    if (!project) {
      const all = await getAllProjects(ctx.teamId);
      const needle = input.projectId.toLowerCase();
      project = all.find((p) => p.name.toLowerCase().includes(needle));
    }

    if (!project) throw new Error(`No project matching "${input.projectId}" found in this team`);

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
