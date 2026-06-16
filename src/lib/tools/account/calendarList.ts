import { z } from 'zod';
import { listScheduledTasksForUser } from '../../recgon/storage';
import { taskRowsToDisplay, type TaskRow } from '../tasks/taskCard';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  days: z.number().int().positive().max(120).optional().describe('How many days ahead to look (default 30).'),
});

type Input = z.infer<typeof parameters>;
interface Output { from: string; to: string; count: number; tasks: TaskRow[]; }

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const calendarListTool: ToolDefinition<Input, Output> = {
  name: 'calendar_list',
  description: 'Show the current user\'s scheduled tasks over the next N days (their calendar). Use for "what\'s on my calendar", "what am I doing this week".',
  parameters,
  summarize: (_input, output) => `${output.count} scheduled task(s)`,
  display: (_input, output) => taskRowsToDisplay(output.tasks),
  handler: async (input, ctx) => {
    const today = new Date();
    const to = new Date(today.getTime() + (input.days ?? 30) * 86_400_000);
    const from = isoDay(today);
    const toStr = isoDay(to);
    const tasks = await listScheduledTasksForUser(ctx.userId, from, toStr);
    return {
      from,
      to: toStr,
      count: tasks.length,
      tasks: tasks.map<TaskRow>((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        scheduledDate: t.scheduledDate,
      })),
    };
  },
};
