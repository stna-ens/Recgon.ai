import { z } from 'zod';
import { deleteProject } from '../../storage';
import { resolveProject } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID. Partial names work.'),
  confirm: z.boolean().optional().describe('Must be true to actually delete. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  projectId: string;
  projectName: string;
  deleted: true;
}

export const projectDeleteTool: ToolDefinition<Input, Output> = {
  name: 'project_delete',
  description:
    'Permanently delete a project and all its analyses, campaigns, and marketing content. Destructive — the user must confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    return `permanently delete project "${project.name}" and all its analyses, campaigns, and content`;
  },
  summarize: (_input, output) => `Deleted project ${output.projectName}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    await deleteProject(project.id, ctx.teamId);
    return { projectId: project.id, projectName: project.name, deleted: true };
  },
};
