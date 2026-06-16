import { z } from 'zod';
import { listTasks, listTeammates } from '../../recgon/storage';
import { resolveProject } from '../resolvers';
import { taskRowsToDisplay, type TaskRow } from './taskCard';
import type { ToolDefinition } from '../types';
import type { TaskStatus } from '../../recgon/types';

const STATUSES = [
  'unassigned', 'assigned', 'accepted', 'in_progress',
  'awaiting_review', 'completed', 'declined', 'failed', 'cancelled',
] as const;

const parameters = z.object({
  status: z.enum(STATUSES).optional().describe('Filter by task status.'),
  assignee: z.string().optional().describe('Filter to tasks assigned to this teammate (name or UUID).'),
  project: z.string().optional().describe('Filter to tasks for this project (name or UUID).'),
  mine: z.boolean().optional().describe('Filter to tasks assigned to the current user.'),
});

type Input = z.infer<typeof parameters>;
interface Output { count: number; tasks: TaskRow[]; }

export const taskListTool: ToolDefinition<Input, Output> = {
  name: 'task_list',
  description:
    'List tasks for the team, optionally filtered by status, assignee, project, or "mine". Use when the user asks to see tasks, the backlog, what is assigned, or what is unassigned.',
  parameters,
  summarize: (_input, output) => `${output.count} task(s)`,
  display: (_input, output) => taskRowsToDisplay(output.tasks),
  handler: async (input, ctx) => {
    const teammates = await listTeammates(ctx.teamId);
    const nameById = new Map(teammates.map((m) => [m.id, m.displayName] as const));

    let assigneeId: string | undefined;
    if (input.assignee) {
      const match = teammates.find(
        (m) => m.id === input.assignee || m.displayName.toLowerCase() === input.assignee!.toLowerCase(),
      );
      assigneeId = match?.id;
    } else if (input.mine) {
      assigneeId = teammates.find((m) => m.userId === ctx.userId)?.id;
    }

    const projectId = input.project
      ? (await resolveProject(input.project, ctx.teamId, ctx.userId)).id
      : undefined;

    const tasks = await listTasks(ctx.teamId, {
      status: input.status as TaskStatus | undefined,
      teammateId: assigneeId,
      projectId,
    });

    return {
      count: tasks.length,
      tasks: tasks.map<TaskRow>((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        scheduledDate: t.scheduledDate,
        assignee: t.assignedTo ? nameById.get(t.assignedTo) ?? null : null,
      })),
    };
  },
};
