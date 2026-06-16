import { z } from 'zod';
import { saveProject, updateProjectShared } from '../../storage';
import { resolveProject } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID. Partial names work.'),
  name: z.string().optional().describe('New project name.'),
  description: z.string().optional().describe('New project description.'),
  shared: z.boolean().optional().describe('Whether the project is shared with the whole team (true) or private to the creator (false).'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  projectId: string;
  projectName: string;
  updated: string[];
}

export const projectUpdateTool: ToolDefinition<Input, Output> = {
  name: 'project_update',
  description:
    "Update a project's name, description, or team-sharing. Use when the user wants to rename a project, change its description, or make it shared/private.",
  parameters,
  summarize: (_input, output) => `Updated ${output.projectName} (${output.updated.join(', ') || 'no changes'})`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);
    const updated: string[] = [];

    if (input.name !== undefined && input.name.trim() && input.name !== project.name) {
      project.name = input.name.trim();
      updated.push('name');
    }
    if (input.description !== undefined && input.description !== project.description) {
      project.description = input.description;
      updated.push('description');
    }
    if (updated.length > 0) await saveProject(project);

    if (input.shared !== undefined) {
      const ok = await updateProjectShared(project.id, ctx.teamId, ctx.userId, input.shared);
      if (!ok) throw new Error('Only the project creator can change sharing.');
      updated.push(input.shared ? 'shared' : 'made private');
    }

    return { projectId: project.id, projectName: project.name, updated };
  },
};
