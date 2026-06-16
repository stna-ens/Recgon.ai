import { z } from 'zod';
import { resolveTeammate } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  teammate: z.string().describe('Teammate name or UUID.'),
});

type Input = z.infer<typeof parameters>;
interface Output {
  id: string;
  displayName: string;
  title: string | null;
  skills: string[];
  capacityHours: number;
  workingDays: string[] | null;
  status: string;
}

export const teammateGetTool: ToolDefinition<Input, Output> = {
  name: 'teammate_get',
  description: 'Get one teammate\'s profile: skills, weekly capacity, working days, and status.',
  parameters,
  summarize: (_input, output) => `${output.displayName} — ${output.skills.length} skill(s)`,
  handler: async (input, ctx) => {
    const t = await resolveTeammate(input.teammate, ctx.teamId);
    return {
      id: t.id,
      displayName: t.displayName,
      title: t.title ?? null,
      skills: t.skills,
      capacityHours: t.capacityHours,
      workingDays: t.workingHours?.days ?? null,
      status: t.status,
    };
  },
};
