import { z } from 'zod';
import { markTaskForTriage, clearTriageNote } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  action: z.enum(['flag', 'clear']).describe('"flag" to hold the task for manual triage; "clear" to release it back to auto-dispatch.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; action: 'flag' | 'clear'; }

export const taskTriageTool: ToolDefinition<Input, Output> = {
  name: 'task_triage',
  description:
    'Flag a task for manual triage (so Recgon won\'t auto-assign it) or clear that flag. Use for "hold X for me to assign" or "let Recgon handle X again".',
  parameters,
  summarize: (_input, output) => `${output.action === 'flag' ? 'Flagged' : 'Cleared triage on'} "${output.title}"`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    if (input.action === 'flag') await markTaskForTriage(task.id, 'no_clear_fit');
    else await clearTriageNote(task.id);
    return { taskId: task.id, title: task.title, action: input.action };
  },
};
