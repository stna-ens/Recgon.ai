import { z } from 'zod';
import { listUnassignedTasks } from '../../recgon/storage';
import { taskRowsToDisplay, type TaskRow } from '../tasks/taskCard';
import type { ToolDefinition } from '../types';

const parameters = z.object({}).describe('No arguments — lists unassigned/triaged tasks needing attention.');
type Input = z.infer<typeof parameters>;
interface Output { count: number; tasks: TaskRow[]; }

export const inboxListTool: ToolDefinition<Input, Output> = {
  name: 'inbox_list',
  description:
    'Show the team inbox: unassigned tasks (and ones Recgon flagged for triage) that need someone to act. Use for "what needs my attention", "show the inbox".',
  parameters,
  summarize: (_input, output) => `${output.count} item(s) need attention`,
  display: (_input, output) => taskRowsToDisplay(output.tasks),
  handler: async (_input, ctx) => {
    const tasks = await listUnassignedTasks(ctx.teamId);
    return {
      count: tasks.length,
      tasks: tasks.map<TaskRow>((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.triageNote ? `triage: ${t.triageNote}` : t.status,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        scheduledDate: t.scheduledDate,
      })),
    };
  },
};
