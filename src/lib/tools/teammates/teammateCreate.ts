import { z } from 'zod';
import { createTeammate } from '../../recgon/storage';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  displayName: z.string().describe('Teammate display name.'),
  title: z.string().optional().describe('Role/title, e.g. "Frontend engineer".'),
  skills: z.array(z.string()).optional().describe('Skill tags.'),
  capacityHours: z.number().positive().optional().describe('Weekly capacity in hours (default 10).'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; displayName: string; }

export const teammateCreateTool: ToolDefinition<Input, Output> = {
  name: 'teammate_create',
  description:
    'Add a new teammate to the roster (for someone Recgon should be able to assign work to). Use for "add a teammate", "add Alice as a backend dev".',
  parameters,
  summarize: (_input, output) => `Added teammate ${output.displayName}`,
  handler: async (input, ctx) => {
    const t = await createTeammate({
      teamId: ctx.teamId,
      displayName: input.displayName.trim(),
      title: input.title,
      skills: input.skills,
      capacityHours: input.capacityHours,
    });
    return { id: t.id, displayName: t.displayName };
  },
};
