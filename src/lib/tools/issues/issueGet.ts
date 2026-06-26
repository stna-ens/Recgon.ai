import { z } from 'zod';
import { getIssue, listIssues, listTasksForIssue } from '../../issueStorage';
import { taskRowsToDisplay, type TaskRow } from '../tasks/taskCard';
import { listTeammates } from '../../recgon/storage';
import type { ToolDefinition } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parameters = z.object({
  issue: z.string().describe('Issue title or UUID. Partial titles work.'),
});

type Input = z.infer<typeof parameters>;

interface Output {
  id: string;
  title: string;
  description: string;
  status: string;
  taskCount: number;
  tasks: TaskRow[];
}

// Resolve an issue by UUID or fuzzy title match, scoped to the team.
async function resolveIssue(ref: string, teamId: string) {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error('Issue reference is empty');
  if (UUID_RE.test(trimmed)) {
    const byId = await getIssue(trimmed);
    if (byId && byId.teamId === teamId) return byId;
  }
  const issues = await listIssues(teamId);
  const needle = trimmed.toLowerCase();
  const exact = issues.find((i) => i.title.toLowerCase() === needle);
  if (exact) return exact;
  const partial = issues.filter(
    (i) => i.title.toLowerCase().includes(needle) || needle.includes(i.title.toLowerCase()),
  );
  if (partial.length >= 1) return partial[0];
  throw new Error(`No issue matching "${ref}"`);
}

export const issueGetTool: ToolDefinition<Input, Output> = {
  name: 'issue_get',
  description:
    'Get one issue plus the tasks Recgon spawned from it. Use when the user asks about a specific issue or what an issue turned into.',
  parameters,
  summarize: (_input, output) => `${output.title} → ${output.taskCount} task(s)`,
  display: (_input, output) => taskRowsToDisplay(output.tasks),
  handler: async (input, ctx) => {
    const issue = await resolveIssue(input.issue, ctx.teamId);
    const [tasks, teammates] = await Promise.all([
      listTasksForIssue(issue.id),
      listTeammates(ctx.teamId),
    ]);
    const nameById = new Map(teammates.map((m) => [m.id, m.displayName] as const));
    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      taskCount: issue.taskCount,
      tasks: tasks.map<TaskRow>((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        estimatedHours: t.estimatedHours,
        scheduledDate: t.scheduledDate,
        assignee: t.assignedTo ? nameById.get(t.assignedTo) ?? null : null,
      })),
    };
  },
};
