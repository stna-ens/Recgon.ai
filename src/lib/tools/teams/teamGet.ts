import { z } from 'zod';
import { getTeam, getTeamMembers } from '../../teamStorage';
import { resolveTeam } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  team: z.string().optional().describe('Team name or UUID. Defaults to the current team.'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; name: string; description: string | null; memberCount: number; }

export const teamGetTool: ToolDefinition<Input, Output> = {
  name: 'team_get',
  description: 'Get a team\'s details: name, description, and member count. Defaults to the current team.',
  parameters,
  summarize: (_input, output) => `${output.name} — ${output.memberCount} member(s)`,
  handler: async (input, ctx) => {
    const teamId = input.team ? (await resolveTeam(input.team, ctx.userId)).id : ctx.teamId;
    const [team, members] = await Promise.all([getTeam(teamId), getTeamMembers(teamId)]);
    if (!team) throw new Error('Team not found.');
    return {
      id: team.id,
      name: team.name,
      description: team.description ?? null,
      memberCount: members.length,
    };
  },
};
