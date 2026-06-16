import { z } from 'zod';
import { reassignTask, getTask } from '../../recgon/storage';
import { resolveTask, resolveTeammate } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  assignee: z
    .string()
    .nullable()
    .describe('New teammate to reassign to (name or UUID), or null to unassign and return it to the backlog.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; assignee: string | null; status: string; }

export const taskReassignTool: ToolDefinition<Input, Output> = {
  name: 'task_reassign',
  description:
    'Move a task to a different teammate, or pass null to unassign it back to the backlog. Use for "reassign X to Y" or "unassign X".',
  parameters,
  summarize: (_input, output) =>
    output.assignee ? `Reassigned "${output.title}" → ${output.assignee}` : `Unassigned "${output.title}"`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    const mate = input.assignee ? await resolveTeammate(input.assignee, ctx.teamId) : null;
    await reassignTask(task.id, mate?.id ?? null, ctx.userId);
    const fresh = (await getTask(task.id)) ?? task;
    return { taskId: task.id, title: task.title, assignee: mate?.displayName ?? null, status: fresh.status };
  },
};
