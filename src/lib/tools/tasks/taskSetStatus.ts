import { z } from 'zod';
import { updateTaskStatus, getTask } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';
import type { TaskStatus } from '../../recgon/types';

// Friendly verbs the user/model will use → canonical TaskStatus.
const ACTION_TO_STATUS: Record<string, TaskStatus> = {
  accept: 'accepted',
  start: 'in_progress',
  complete: 'completed',
  done: 'completed',
  decline: 'declined',
  cancel: 'cancelled',
};

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  action: z
    .enum(['accept', 'start', 'complete', 'done', 'decline', 'cancel'])
    .describe('What to do: accept, start (begin work), complete/done, decline, or cancel.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; status: string; }

export const taskSetStatusTool: ToolDefinition<Input, Output> = {
  name: 'task_set_status',
  description:
    'Change a task\'s lifecycle status: accept, start, complete, decline, or cancel it. Use for "mark X done", "accept X", "I finished X", "decline X".',
  parameters,
  summarize: (_input, output) => `"${output.title}" → ${output.status}`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    const status = ACTION_TO_STATUS[input.action];
    await updateTaskStatus(task.id, status);
    const fresh = (await getTask(task.id)) ?? task;
    return { taskId: task.id, title: task.title, status: fresh.status };
  },
};
