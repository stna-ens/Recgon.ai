import { z } from 'zod';
import { deleteTeam } from '../../teamStorage';
import { resolveTeam } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  team: z.string().describe('Team name or UUID to delete.'),
  confirm: z.boolean().optional().describe('Must be true to delete. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; name: string; deleted: true; }

export const teamDeleteTool: ToolDefinition<Input, Output> = {
  name: 'team_delete',
  description: 'Permanently delete a team and all its data. Only the owner can. Destructive — confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async (input, ctx) => {
    const team = await resolveTeam(input.team, ctx.userId);
    return `permanently delete team "${team.name}" and all its projects, tasks, and members`;
  },
  summarize: (_input, output) => `Deleted team ${output.name}`,
  handler: async (input, ctx) => {
    const team = await resolveTeam(input.team, ctx.userId);
    await deleteTeam(team.id, ctx.userId);
    return { id: team.id, name: team.name, deleted: true };
  },
};
