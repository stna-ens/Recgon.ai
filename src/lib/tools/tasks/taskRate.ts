import { z } from 'zod';
import { upsertRating } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  rating: z.enum(['up', 'down']).describe('Thumbs up (good work) or thumbs down.'),
  note: z.string().optional().describe('Optional feedback note.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; rating: 'up' | 'down'; }

export const taskRateTool: ToolDefinition<Input, Output> = {
  name: 'task_rate',
  description:
    'Rate a completed task thumbs-up or thumbs-down (feeds the teammate\'s fit learning). Use for "rate X up", "that was great work", "thumbs down on X".',
  parameters,
  summarize: (_input, output) => `Rated "${output.title}" ${output.rating}`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    if (!task.assignedTo) throw new Error('This task has no assignee to rate.');
    await upsertRating({
      taskId: task.id,
      teammateId: task.assignedTo,
      rating: input.rating === 'up' ? 1 : -1,
      note: input.note,
      ratedBy: ctx.userId,
    });
    return { taskId: task.id, title: task.title, rating: input.rating };
  },
};
