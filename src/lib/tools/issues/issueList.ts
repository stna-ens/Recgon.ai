import { z } from 'zod';
import { listIssues } from '../../issueStorage';
import { issueRowsToDisplay, type IssueCardRow } from './issueCard';
import type { ToolDefinition } from '../types';

const STATUSES = ['open', 'converting', 'converted', 'closed'] as const;

const parameters = z.object({
  status: z.enum(STATUSES).optional().describe('Filter by issue status.'),
});

type Input = z.infer<typeof parameters>;
interface Output { count: number; issues: IssueCardRow[]; }

export const issueListTool: ToolDefinition<Input, Output> = {
  name: 'issue_list',
  description:
    'List issues filed on this team, optionally filtered by status. Use when the user asks to see issues, the issue inbox, or what has been reported.',
  parameters,
  summarize: (_input, output) => `${output.count} issue(s)`,
  display: (_input, output) => issueRowsToDisplay(output.issues),
  handler: async (input, ctx) => {
    let issues = await listIssues(ctx.teamId);
    if (input.status) issues = issues.filter((i) => i.status === input.status);
    return {
      count: issues.length,
      issues: issues.map<IssueCardRow>((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        status: i.status,
        taskCount: i.taskCount,
      })),
    };
  },
};
