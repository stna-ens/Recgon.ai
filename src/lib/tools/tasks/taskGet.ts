import { z } from 'zod';
import { getTask, getRating, listTeammates } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import { taskRowsToDisplay } from './taskCard';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID. Partial titles work.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  kind: string;
  estimatedHours: number;
  deadline: string | null;
  scheduledDate: string | null;
  requiredSkills: string[];
  assignee: string | null;
  verificationStatus: string;
  rating: number | null;
}

export const taskGetTool: ToolDefinition<Input, Output> = {
  name: 'task_get',
  description:
    'Get the full details of one task (description, status, priority, schedule, assignee, verification, rating). Use when the user asks about a specific task.',
  parameters,
  summarize: (_input, output) => `${output.title} [${output.status}]`,
  display: (_input, output) =>
    taskRowsToDisplay([
      {
        id: output.id,
        title: output.title,
        description: output.description,
        status: output.status,
        priority: output.priority,
        estimatedHours: output.estimatedHours,
        scheduledDate: output.scheduledDate,
        assignee: output.assignee,
      },
    ]),
  handler: async (input, ctx) => {
    const resolved = await resolveTask(input.task, ctx.teamId);
    const task = (await getTask(resolved.id)) ?? resolved;
    const [teammates, rating] = await Promise.all([
      listTeammates(ctx.teamId),
      getRating(task.id).catch(() => null),
    ]);
    const assignee = task.assignedTo
      ? teammates.find((m) => m.id === task.assignedTo)?.displayName ?? task.assignedTo
      : null;
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      kind: task.kind,
      estimatedHours: task.estimatedHours,
      deadline: task.deadline,
      scheduledDate: task.scheduledDate,
      requiredSkills: task.requiredSkills,
      assignee,
      verificationStatus: task.verificationStatus,
      rating: rating?.rating ?? null,
    };
  },
};
