import { z } from 'zod';
import { setTaskProof } from '../../recgon/storage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  text: z.string().optional().describe('Free-text proof of what was done.'),
  links: z.array(z.string()).optional().describe('Evidence links (PR, deploy, doc URLs).'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; }

export const taskProofTool: ToolDefinition<Input, Output> = {
  name: 'task_set_proof',
  description:
    'Submit proof of completion for a task (text and/or links). Use for "here\'s the proof for X" or "mark X as done with this PR".',
  parameters,
  summarize: (_input, output) => `Proof submitted for "${output.title}"`,
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    if (!input.text && (!input.links || input.links.length === 0)) {
      throw new Error('Provide proof text or at least one link.');
    }
    await setTaskProof(task.id, {
      text: input.text,
      links: input.links,
      submittedAt: new Date().toISOString(),
      submittedBy: ctx.userId,
    });
    return { taskId: task.id, title: task.title };
  },
};
