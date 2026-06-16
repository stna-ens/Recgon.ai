import { z } from 'zod';
import { mintUserTask } from '../../recgon/taskMint';
import { dispatchTask } from '../../recgon/dispatcher';
import { getTask, listTeammates } from '../../recgon/storage';
import { resolveProject, resolveTeammate } from '../resolvers';
import { taskRowsToDisplay } from './taskCard';
import type { ToolDefinition } from '../types';
import type { TaskKind } from '../../recgon/types';

const KINDS = ['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'] as const;

const parameters = z.object({
  title: z.string().describe('Short task title.'),
  description: z.string().optional().describe('What needs to be done.'),
  project: z.string().optional().describe('Project this task belongs to (name or UUID).'),
  kind: z.enum(KINDS).optional().describe('Task category. Defaults to "custom".'),
  priority: z.number().int().min(0).max(3).optional().describe('0=P3 (low) .. 3=P0 (urgent). Default 2.'),
  estimatedHours: z.number().positive().optional().describe('Rough effort in hours. Default 1.'),
  requiredSkills: z.array(z.string()).optional().describe('Skills needed (auto-inferred if omitted).'),
  deadline: z.string().optional().describe('ISO date the task is due.'),
  assignee: z.string().optional().describe('Assign directly to this teammate (name or UUID). If omitted, Recgon auto-dispatches to the best-fit teammate.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
}

export const taskCreateTool: ToolDefinition<Input, Output> = {
  name: 'task_create',
  description:
    'Create a new task. Optionally assign it to a teammate; otherwise Recgon auto-dispatches it to the best-fit teammate. Use when the user wants to add a to-do, a task, or work for the team.',
  parameters,
  summarize: (_input, output) => `Created "${output.title}" [${output.status}]`,
  display: (_input, output) =>
    taskRowsToDisplay([
      { id: output.id, title: output.title, status: output.status, priority: 2, assignee: output.assignee },
    ]),
  handler: async (input, ctx) => {
    const projectId = input.project
      ? (await resolveProject(input.project, ctx.teamId, ctx.userId)).id
      : null;

    const task = await mintUserTask({
      teamId: ctx.teamId,
      projectId,
      title: input.title.trim(),
      description: input.description?.trim() || '',
      kind: (input.kind as TaskKind | undefined) ?? 'custom',
      requiredSkills: input.requiredSkills,
      priority: input.priority,
      estimatedHours: input.estimatedHours,
      deadline: input.deadline ?? null,
      createdBy: ctx.userId,
    });

    // Explicit assignee → assign directly. Otherwise auto-dispatch (best-effort;
    // the cron picks it up if this fails).
    if (input.assignee) {
      const mate = await resolveTeammate(input.assignee, ctx.teamId);
      const { reassignTask } = await import('../../recgon/storage');
      await reassignTask(task.id, mate.id, ctx.userId);
    } else {
      try {
        await dispatchTask(ctx.teamId, task.id);
      } catch {
        /* swallowed — task persists as unassigned, cron will dispatch */
      }
    }

    const fresh = (await getTask(task.id)) ?? task;
    const teammates = await listTeammates(ctx.teamId);
    const assignee = fresh.assignedTo
      ? teammates.find((m) => m.id === fresh.assignedTo)?.displayName ?? fresh.assignedTo
      : null;
    return { id: fresh.id, title: fresh.title, status: fresh.status, assignee };
  },
};
