import { z } from 'zod';
import { runDispatch } from '../../recgon/dispatcher';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  confirm: z.boolean().optional().describe('Must be true to run. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;
interface Output { minted: number; assigned: number; triaged: number; deferred: number; noFit: number; }

export const dispatchRunTool: ToolDefinition<Input, Output> = {
  name: 'dispatch_run',
  description:
    'Run Recgon\'s full dispatcher: read the brain, mint new tasks, and auto-assign the whole backlog to best-fit teammates. This assigns real work — confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async () => 'run the full dispatcher now (mints tasks and assigns the backlog to teammates)',
  summarize: (_input, output) => `Minted ${output.minted}, assigned ${output.assigned}, triaged ${output.triaged}`,
  handler: async (_input, ctx) => {
    const r = await runDispatch(ctx.teamId);
    return {
      minted: r.minted,
      assigned: r.assigned,
      triaged: r.triaged,
      deferred: r.deferred,
      noFit: r.noFit,
    };
  },
};
