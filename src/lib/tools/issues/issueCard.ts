import type { ToolDisplay, ToolDisplayItem } from '../types';

/** Minimal issue shape the issue tools return and cards render from. */
export interface IssueCardRow {
  id: string;
  title: string;
  description?: string;
  status: string;
  taskCount: number;
}

export function issueRowToCard(i: IssueCardRow): ToolDisplayItem {
  const badges: string[] = [i.status, `${i.taskCount} task${i.taskCount === 1 ? '' : 's'}`];
  return {
    id: i.id,
    title: i.title,
    subtitle: i.description ? i.description.slice(0, 140) : undefined,
    badges,
    href: '/issues',
  };
}

export function issueRowsToDisplay(issues: IssueCardRow[]): ToolDisplay {
  return { kind: 'generic', items: issues.map(issueRowToCard) };
}
