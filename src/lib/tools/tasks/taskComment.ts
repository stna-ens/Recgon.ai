import { z } from 'zod';
import { addComment, listComments } from '../../recgon/commentStorage';
import { resolveTask } from '../resolvers';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  task: z.string().describe('Task title or UUID.'),
  body: z.string().optional().describe('Comment text to add. Omit to just read the thread.'),
});

type Input = z.infer<typeof parameters>;
interface Output { taskId: string; title: string; added: boolean; comments: Array<{ body: string; at: string }>; }

export const taskCommentTool: ToolDefinition<Input, Output> = {
  name: 'task_comment',
  description:
    'Add a comment to a task\'s thread, or read recent comments when no body is given. Recgon reads task discussion when deciding work. Use for "comment on X" or "what\'s been said about X".',
  parameters,
  summarize: (_input, output) => (output.added ? `Commented on "${output.title}"` : `${output.comments.length} comment(s)`),
  handler: async (input, ctx) => {
    const task = await resolveTask(input.task, ctx.teamId);
    let added = false;
    if (input.body?.trim()) {
      await addComment({ taskId: task.id, teamId: ctx.teamId, authorUserId: ctx.userId, body: input.body });
      added = true;
    }
    const comments = (await listComments(task.id))
      .filter((c) => !c.deletedAt)
      .slice(-10)
      .map((c) => ({ body: c.body, at: c.createdAt }));
    return { taskId: task.id, title: task.title, added, comments };
  },
};
