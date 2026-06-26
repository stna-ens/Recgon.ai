// quick-260626-rdo — unit tests for the per-project rollup count derivation
// used by /admin's ProjectRollup. Counts come purely from the command payload,
// so the pure helper is testable without rendering.

import { describe, it, expect } from 'vitest';
import { deriveProjectRollup } from '@/components/v2/admin/ProjectRollup';
import type { CommandProject, CommandTask } from '@/components/v2/command/types';

// deriveProjectRollup only reads projectId, status, scheduledDate, overdueTier.
// Cast a minimal shape to CommandTask to avoid filling every unrelated field.
function task(partial: Partial<CommandTask>): CommandTask {
  return {
    projectId: null,
    status: 'assigned',
    scheduledDate: null,
    overdueTier: 0,
    ...partial,
  } as CommandTask;
}

const projects: CommandProject[] = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
];

describe('deriveProjectRollup', () => {
  it('groups open / scheduled / overdue counts per project', () => {
    const tasks: CommandTask[] = [
      task({ projectId: 'p1', status: 'in_progress', scheduledDate: '2026-06-26', overdueTier: 0 }),
      task({ projectId: 'p1', status: 'unassigned', scheduledDate: null, overdueTier: 2 }),
      task({ projectId: 'p1', status: 'done', scheduledDate: '2026-06-27', overdueTier: 0 }),
      task({ projectId: 'p2', status: 'accepted', scheduledDate: null, overdueTier: 1 }),
    ];

    const rows = deriveProjectRollup(tasks, projects);
    const alpha = rows.find((r) => r.id === 'p1')!;
    const beta = rows.find((r) => r.id === 'p2')!;

    // Alpha: 2 open (in_progress, unassigned — 'done' is not open),
    // 2 scheduled (the two with dates), 1 overdue.
    expect(alpha).toMatchObject({ name: 'Alpha', open: 2, scheduled: 2, overdue: 1 });
    // Beta: 1 open, 0 scheduled, 1 overdue.
    expect(beta).toMatchObject({ name: 'Beta', open: 1, scheduled: 0, overdue: 1 });
  });

  it('excludes tasks with a null projectId', () => {
    const tasks: CommandTask[] = [
      task({ projectId: null, status: 'in_progress', scheduledDate: '2026-06-26', overdueTier: 3 }),
      task({ projectId: 'p1', status: 'assigned', scheduledDate: null, overdueTier: 0 }),
    ];

    const rows = deriveProjectRollup(tasks, projects);
    const total = rows.reduce((sum, r) => sum + r.open + r.scheduled + r.overdue, 0);
    // Only the single p1 open task contributes; the null-projectId task is skipped.
    expect(total).toBe(1);
    expect(rows.find((r) => r.id === 'p1')).toMatchObject({ open: 1, scheduled: 0, overdue: 0 });
  });

  it('returns a zeroed row for every project even with no tasks', () => {
    const rows = deriveProjectRollup([], projects);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.open === 0 && r.scheduled === 0 && r.overdue === 0)).toBe(true);
  });
});
