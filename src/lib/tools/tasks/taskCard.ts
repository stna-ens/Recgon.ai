import type { ToolDisplay, ToolDisplayItem } from '../types';

/** The minimal task shape tools return and cards render from. */
export interface TaskRow {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  estimatedHours?: number;
  scheduledDate?: string | null;
  assignee?: string | null;
}

export function taskRowToCard(t: TaskRow): ToolDisplayItem {
  const badges: string[] = [t.status];
  if (t.priority >= 3) badges.push('P0');
  if (t.scheduledDate) badges.push(t.scheduledDate);
  if (t.estimatedHours) badges.push(`${t.estimatedHours}h`);
  if (t.assignee) badges.push(`→ ${t.assignee}`);
  return {
    id: t.id,
    title: t.title,
    subtitle: t.description ? t.description.slice(0, 140) : undefined,
    badges,
    href: '/tasks',
  };
}

export function taskRowsToDisplay(tasks: TaskRow[]): ToolDisplay {
  return { kind: 'tasks', items: tasks.map(taskRowToCard) };
}
