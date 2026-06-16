import { z } from 'zod';
import { snoozeTask } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  days: z.number().int().positive().describe('How many days to push the task out.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; days: number; }

export const taskSnoozeTool: ToolDefinition<Input, Output> = {
  name: 'task_snooze',
  description: 'Defer a task by N days. Use for "snooze X for 3 days" or "push X back a week".',
  parameters,
  summarize: (_input, output) => `Snoozed "${output.title}" ${output.days}d`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    await snoozeTask(task.id, input.days);
    return { taskId: task.id, title: task.title, days: input.days };
  },
};
