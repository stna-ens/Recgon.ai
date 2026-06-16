import { z } from 'zod';
import { createTeam } from '../../teamStorage';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  name: z.string().describe('Name for the new team.'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; name: string; }

export const teamCreateTool: ToolDefinition<Input, Output> = {
  name: 'team_create',
  description: 'Create a new team (you become its owner). Use for "create a team called X".',
  parameters,
  summarize: (_input, output) => `Created team ${output.name}`,
  handler: async (input, ctx) => {
    const team = await createTeam(input.name.trim(), ctx.userId);
    return { id: team.id, name: team.name };
  },
};
