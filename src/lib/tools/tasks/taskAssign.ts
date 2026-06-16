import { z } from 'zod';
import { reassignTask, getTask } from '../../recgon/storage';
import { resolveTask, resolveTeammate } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  assignee: z.string().describe('Teammate to assign it to (name or UUID).'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; assignee: string; status: string; }

export const taskAssignTool: ToolDefinition<Input, Output> = {
  name: 'task_assign',
  description:
    'Assign a task to a teammate. Use when the user says "assign X to Y" or "give the login bug to Alice".',
  parameters,
  summarize: (_input, output) => `Assigned "${output.title}" → ${output.assignee}`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    const mate = await resolveTeammate(input.assignee, ctx.teamId);
    await reassignTask(task.id, mate.id, ctx.userId);
    const fresh = (await getTask(task.id)) ?? task;
    return { taskId: task.id, title: task.title, assignee: mate.displayName, status: fresh.status };
  },
};
