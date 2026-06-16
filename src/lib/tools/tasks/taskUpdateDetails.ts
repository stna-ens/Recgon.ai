import { z } from 'zod';
import { updateTaskDetails, updateTaskRequiredSkills } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  title: z.string().optional().describe('New title.'),
  description: z.string().optional().describe('New description.'),
  priority: z.number().int().min(0).max(3).optional().describe('0=P3 (low) .. 3=P0 (urgent).'),
  deadline: z.string().nullable().optional().describe('New deadline YYYY-MM-DD, or null to clear.'),
  requiredSkills: z.array(z.string()).optional().describe('Replace the task\'s required skills.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; updated: string[]; }

export const taskUpdateDetailsTool: ToolDefinition<Input, Output> = {
  name: 'task_update_details',
  description:
    "Edit a task's title, description, priority, deadline, or required skills. Use for \"rename task X\", \"bump X to urgent\", \"change the deadline\".",
  parameters,
  summarize: (_input, output) => `Updated task (${output.updated.join(', ') || 'no changes'})`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    const updated: string[] = [];

    const fields: { title?: string; description?: string; priority?: number; deadline?: string | null } = {};
    if (input.title !== undefined) { fields.title = input.title; updated.push('title'); }
    if (input.description !== undefined) { fields.description = input.description; updated.push('description'); }
    if (input.priority !== undefined) { fields.priority = input.priority; updated.push('priority'); }
    if (input.deadline !== undefined) { fields.deadline = input.deadline; updated.push('deadline'); }
    if (Object.keys(fields).length > 0) await updateTaskDetails(task.id, fields);

    if (input.requiredSkills !== undefined) {
      await updateTaskRequiredSkills(task.id, input.requiredSkills);
      updated.push('skills');
    }

    return { taskId: task.id, updated };
  },
};
