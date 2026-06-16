import { z } from 'zod';
import { updateProjectAnalyticsProperty } from '../../storage';
import { resolveProject } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID.'),
  propertyId: z
    .string()
    .nullable()
    .describe('GA4 property ID to attach (e.g. "521058612"), or null to disconnect analytics.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  projectId: string;
  projectName: string;
  propertyId: string | null;
}

export const projectSetAnalyticsPropertyTool: ToolDefinition<Input, Output> = {
  name: 'project_set_analytics_property',
  description:
    'Attach or change the GA4 analytics property ID on a project, or pass null to disconnect it. Use when the user wants to connect/disconnect Google Analytics for a project.',
  parameters,
  summarize: (_input, output) =>
    output.propertyId
      ? `${output.projectName} → GA4 ${output.propertyId}`
      : `${output.projectName} → GA4 disconnected`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    const ok = await updateProjectAnalyticsProperty(project.id, input.propertyId, ctx.teamId);
    if (!ok) throw new Error('Failed to update analytics property.');
    return { projectId: project.id, projectName: project.name, propertyId: input.propertyId };
  },
};
