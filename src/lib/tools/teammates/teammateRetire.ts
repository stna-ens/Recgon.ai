import { z } from 'zod';
import { retireTeammate } from '../../recgon/storage';
import { resolveTeammate } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  teammate: z.string().describe('Teammate name or UUID.'),
  confirm: z.boolean().optional().describe('Must be true to retire. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; displayName: string; retired: true; }

export const teammateRetireTool: ToolDefinition<Input, Output> = {
  name: 'teammate_retire',
  description:
    'Retire a teammate so Recgon stops assigning them work (their history is kept). Destructive — confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async (input, ctx) => {
    const t = await resolveTeammate(input.teammate, ctx.teamId);
    return `retire ${t.displayName} (Recgon will stop assigning them work)`;
  },
  summarize: (_input, output) => `Retired ${output.displayName}`,
  handler: async (input, ctx) => {
    const t = await resolveTeammate(input.teammate, ctx.teamId);
    await retireTeammate(t.id);
    return { id: t.id, displayName: t.displayName, retired: true };
  },
};
