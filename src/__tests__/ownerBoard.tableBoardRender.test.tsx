// Phase 3.5 / Plan 03.5-04 — TableBoard render contract.
//
// Locks the contract from the plan:
//   - 6 column headers in order TASK / ASSIGNEE / PROJECT / DATE / PRIORITY / STATE
//   - N task rows + N kebab buttons
//   - Empty-state copy renders when tasks = []

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableBoard } from '@/components/v2/projects/owner/TableBoard';
import {
  aliceTeammate,
  bobTeammate,
  carolTeammate,
  fixtureTask,
} from './ownerBoard/setup';

// jsdom shim — Radix DropdownMenu uses these PointerEvent APIs which jsdom omits.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (() => false) as Element['hasPointerCapture'];
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = (() => {}) as Element['setPointerCapture'];
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = (() => {}) as Element['releasePointerCapture'];
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (() => {}) as Element['scrollIntoView'];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

const teammates = [aliceTeammate, bobTeammate, carolTeammate];
const projects = [
  { id: 'project-1', name: 'Recgon' },
];

const taskA = fixtureTask({
  id: 'task-a',
  title: 'Wire OAuth callback',
  assignedTo: 'tm-alice',
  status: 'assigned',
  priority: 0, // urgent
  scheduledDate: '2026-05-17',
  projectId: 'project-1',
});
const taskB = fixtureTask({
  id: 'task-b',
  title: 'Audit logging',
  assignedTo: 'tm-bob',
  status: 'in_progress',
  priority: 1, // high
  scheduledDate: '2026-05-19',
  projectId: 'project-1',
});
const taskC = fixtureTask({
  id: 'task-c',
  title: 'Refactor auth module',
  assignedTo: null,
  status: 'unassigned',
  priority: 3, // low
  scheduledDate: null,
  projectId: null,
  triageNote: 'no_clear_fit',
});

describe('<TableBoard /> — render contract (Plan 03.5-04 Task 1)', () => {
  it('renders 6 column headers in order TASK / ASSIGNEE / PROJECT / DATE / PRIORITY / STATE', () => {
    render(
      <TableBoard
        tasks={[taskA, taskB, taskC]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    // Each header is a <button> with aria-label="sort by {column}".
    const headers = screen.getAllByRole('button', { name: /^sort by /i });
    expect(headers).toHaveLength(6);
    expect(headers[0].getAttribute('aria-label')).toMatch(/sort by task/i);
    expect(headers[1].getAttribute('aria-label')).toMatch(/sort by assignee/i);
    expect(headers[2].getAttribute('aria-label')).toMatch(/sort by project/i);
    expect(headers[3].getAttribute('aria-label')).toMatch(/sort by date/i);
    expect(headers[4].getAttribute('aria-label')).toMatch(/sort by priority/i);
    expect(headers[5].getAttribute('aria-label')).toMatch(/sort by state/i);
  });

  it('renders N task rows + N kebab buttons with aria-label="task actions"', () => {
    render(
      <TableBoard
        tasks={[taskA, taskB, taskC]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    // Three task rows — exposed via role="button" + aria-label="open task ..."
    const rowButtons = screen.getAllByRole('button', { name: /^open task /i });
    expect(rowButtons).toHaveLength(3);

    // Per-row kebab buttons.
    const kebabs = screen.getAllByRole('button', { name: /task actions/i });
    expect(kebabs).toHaveLength(3);
  });

  it('renders the empty-state copy when tasks is []', () => {
    render(
      <TableBoard
        tasks={[]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    expect(screen.getByText(/no tasks scheduled in this window/i)).toBeTruthy();
    // No row buttons either.
    expect(screen.queryAllByRole('button', { name: /^open task /i })).toHaveLength(0);
  });

  it('exposes data-testid="owner-table-board" on the root for view-toggle test wiring', () => {
    const { container } = render(
      <TableBoard
        tasks={[taskA]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="owner-table-board"]')).toBeTruthy();
  });
});
