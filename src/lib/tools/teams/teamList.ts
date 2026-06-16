import { z } from 'zod';
import { getUserTeams } from '../../teamStorage';
import type { ToolDefinition, ToolDisplay } from '../types';

const parameters = z.object({}).describe('No arguments — lists the teams you belong to.');
type Input = z.infer<typeof parameters>;
interface Output { count: number; teams: Array<{ id: string; name: string; role: string }>; }

export const teamListTool: ToolDefinition<Input, Output> = {
  name: 'team_list',
  description: 'List the teams you belong to and your role in each. Use when the user asks what teams they are in.',
  parameters,
  summarize: (_input, output) => `${output.count} team(s)`,
  display: (_input, output): ToolDisplay => ({
    kind: 'generic',
    items: output.teams.map((t) => ({ id: t.id, title: t.name, badges: [t.role] })),
  }),
  handler: async (_input, ctx) => {
    const teams = await getUserTeams(ctx.userId);
    return {
      count: teams.length,
      teams: teams.map((t) => ({ id: t.id, name: t.name, role: t.role })),
    };
  },
};
