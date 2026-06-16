import { z } from 'zod';
import { dispatchTask } from '../../recgon/dispatcher';
import { getTask, listTeammates } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID to (re)dispatch.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; outcome: string; assignee: string | null; }

export const dispatchTaskTool: ToolDefinition<Input, Output> = {
  name: 'dispatch_task',
  description:
    'Ask Recgon to auto-assign ONE specific unassigned task to the best-fit teammate (with reasoning). Use for "let Recgon assign X", "find someone for X".',
  parameters,
  summarize: (_input, output) => `${output.title}: ${output.outcome}${output.assignee ? ` → ${output.assignee}` : ''}`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    const outcome = await dispatchTask(ctx.teamId, task.id);
    const fresh = (await getTask(task.id)) ?? task;
    let assignee: string | null = null;
    if (fresh.assignedTo) {
      const mates = await listTeammates(ctx.teamId);
      assignee = mates.find((m) => m.id === fresh.assignedTo)?.displayName ?? fresh.assignedTo;
    }
    return { taskId: task.id, title: task.title, outcome, assignee };
  },
};
