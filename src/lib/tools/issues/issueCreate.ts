import { z } from 'zod';
import { createIssue } from '../../issueStorage';
import { convertIssueToTasks } from '../../recgon/issueToTasks';
import { getUserById } from '../../userStorage';
import { issueRowsToDisplay } from './issueCard';
import type { ToolDefinition } from '../types';
import type { OutputLanguage } from '../../prompts';

const parameters = z.object({
  title: z.string().describe('Short issue title — what needs doing.'),
  description: z.string().optional().describe('More detail so Recgon can scope the tasks well.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  id: string;
  title: string;
  status: string;
  taskCount: number;
}

export const issueCreateTool: ToolDefinition<Input, Output> = {
  name: 'issue_create',
  description:
    'File an issue (something that needs doing). Recgon breaks it into the right tasks and routes them to the best-fit teammates. Use when the user reports a bug, a request, or "we need to…" work that should become tasks.',
  parameters,
  summarize: (_input, output) => `Filed "${output.title}" → ${output.taskCount} task(s)`,
  display: (_input, output) =>
    issueRowsToDisplay([
      { id: output.id, title: output.title, status: output.status, taskCount: output.taskCount },
    ]),
  handler: async (input, ctx) => {
    const issue = await createIssue(ctx.teamId, {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      createdBy: ctx.userId,
    });

    // Convert in the user's language (mirrors the REST route). Fail-soft on the
    // language lookup — default English.
    let language: OutputLanguage = 'en';
    try {
      language = ((await getUserById(ctx.userId))?.language as OutputLanguage) ?? 'en';
    } catch {
      /* default en */
    }

    const { taskCount } = await convertIssueToTasks(issue.id, { language });
    return { id: issue.id, title: issue.title, status: 'converted', taskCount };
  },
};
