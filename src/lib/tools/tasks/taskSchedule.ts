import { z } from 'zod';
import { setTaskSchedule } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  scheduledDate: z.string().describe('Start day, YYYY-MM-DD.'),
  scheduledUntilDate: z.string().optional().describe('End day (inclusive) for a multi-day task, YYYY-MM-DD.'),
  deadline: z.string().nullable().optional().describe('Hard due date, YYYY-MM-DD, or null to clear.'),
  note: z.string().optional().describe('Why this schedule (shown to the assignee).'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; scheduledDate: string; }

export const taskScheduleTool: ToolDefinition<Input, Output> = {
  name: 'task_schedule',
  description:
    'Set or change when a task is scheduled (start day, optional end day, deadline). Use for "schedule X for Friday" or "move X to next week".',
  parameters,
  summarize: (_input, output) => `Scheduled for ${output.scheduledDate}`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    await setTaskSchedule(task.id, {
      scheduledDate: input.scheduledDate,
      scheduledUntilDate: input.scheduledUntilDate,
      deadline: input.deadline,
      scheduleNote: input.note,
    });
    return { taskId: task.id, scheduledDate: input.scheduledDate };
  },
};
