// Phase 3.5 / Plan 03.5-04 — TableBoard sort contract.
//
// Locks the sort behavior from the plan:
//   - Initial: by scheduledDate ascending, null dates last.
//   - Click PRIORITY header → 0 (urgent) < 1 (high) < 3 (low) ascending; click again → descending.
//   - Click DATE header → ISO date ascending; null last.
//   - Tie-breaker = task.id ascending for determinism.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TableBoard } from '@/components/v2/projects/owner/TableBoard';
import {
  aliceTeammate,
  bobTeammate,
  carolTeammate,
  fixtureTask,
} from './ownerBoard/setup';

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

const teammates = [aliceTeammate, bobTeammate, carolTeammate];
const projects = [{ id: 'project-1', name: 'Recgon' }];

// Three tasks of mixed priorities 0, 1, 3 and three different scheduled dates
// including one null.
const taskUrgent = fixtureTask({
  id: 'task-urgent',
  title: 'Z urgent fix',           // alphabetically last
  priority: 0,
  scheduledDate: '2026-05-19',
  assignedTo: 'tm-alice',
  status: 'assigned',
  projectId: 'project-1',
});
const taskHigh = fixtureTask({
  id: 'task-high',
  title: 'A high task',            // alphabetically first
  priority: 1,
  scheduledDate: '2026-05-17',
  assignedTo: 'tm-bob',
  status: 'in_progress',
  projectId: 'project-1',
});
const taskLow = fixtureTask({
  id: 'task-low',
  title: 'M low task',
  priority: 3,
  scheduledDate: null,
  assignedTo: 'tm-carol',
  status: 'unassigned',
  projectId: null,
  triageNote: 'no_clear_fit',
});

function getRowOrder(): string[] {
  // Each row is role="button" with aria-label="open task <title>"
  const rows = screen.getAllByRole('button', { name: /^open task /i });
  return rows.map((r) => r.getAttribute('aria-label')?.replace(/^open task /i, '').trim() ?? '');
}

describe('<TableBoard /> — sort contract (Plan 03.5-04 Task 1)', () => {
  it('clicking PRIORITY header sorts ascending (0,1,3) then descending (3,1,0)', () => {
    render(
      <TableBoard
        tasks={[taskLow, taskUrgent, taskHigh]}  // intentionally scrambled
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    // Click PRIORITY header → asc (0,1,3).
    fireEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(getRowOrder()).toEqual(['Z urgent fix', 'A high task', 'M low task']);

    // Click again → desc (3,1,0).
    fireEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(getRowOrder()).toEqual(['M low task', 'A high task', 'Z urgent fix']);
  });

  it('clicking DATE header sorts ascending (ISO asc, null last) then descending', () => {
    render(
      <TableBoard
        tasks={[taskLow, taskUrgent, taskHigh]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    // First click: ascending. 2026-05-17 < 2026-05-19 < null
    fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));
    expect(getRowOrder()).toEqual(['A high task', 'Z urgent fix', 'M low task']);

    // Second click: descending. Null pinned last in both orderings? Plan
    // says null dates last; descending reverses ISO order but null still
    // sorts last (it has no meaningful position in either direction).
    fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));
    expect(getRowOrder()).toEqual(['Z urgent fix', 'A high task', 'M low task']);
  });

  it('tie-breaks by task.id ascending when sort key is equal', () => {
    const tieA = fixtureTask({ id: 'tie-a', title: 'tie A', priority: 2, scheduledDate: '2026-05-17', assignedTo: 'tm-alice' });
    const tieB = fixtureTask({ id: 'tie-b', title: 'tie B', priority: 2, scheduledDate: '2026-05-17', assignedTo: 'tm-bob' });
    const tieC = fixtureTask({ id: 'tie-c', title: 'tie C', priority: 2, scheduledDate: '2026-05-17', assignedTo: 'tm-carol' });

    render(
      <TableBoard
        tasks={[tieC, tieA, tieB]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    // PRIORITY tie → fall back to id asc (tie-a, tie-b, tie-c).
    fireEvent.click(screen.getByRole('button', { name: /sort by priority/i }));
    expect(getRowOrder()).toEqual(['tie A', 'tie B', 'tie C']);
  });

  it('shows the ↑ glyph on the active sort column (asc), ↓ when descending', () => {
    render(
      <TableBoard
        tasks={[taskLow, taskUrgent, taskHigh]}
        teammates={teammates}
        projects={projects}
        onRowClick={vi.fn()}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    const priorityHeader = screen.getByRole('button', { name: /sort by priority/i });

    // Initial: sort by DATE asc → DATE shows ↑; PRIORITY shows no glyph.
    expect(within(priorityHeader).queryByText('↑')).toBeNull();
    expect(within(priorityHeader).queryByText('↓')).toBeNull();

    // Click priority → ↑.
    fireEvent.click(priorityHeader);
    expect(within(priorityHeader).getByText('↑')).toBeTruthy();

    // Click again → ↓.
    fireEvent.click(priorityHeader);
    expect(within(priorityHeader).getByText('↓')).toBeTruthy();
  });

  it('row click invokes onRowClick(task); kebab click does NOT invoke onRowClick', () => {
    const onRowClick = vi.fn();
    render(
      <TableBoard
        tasks={[taskHigh]}
        teammates={teammates}
        projects={projects}
        onRowClick={onRowClick}
        onAssign={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );

    const row = screen.getByRole('button', { name: /^open task a high task$/i });
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledWith(taskHigh);

    onRowClick.mockClear();
    const kebab = screen.getByRole('button', { name: /task actions/i });
    // Use pointerDown which Radix listens to + click — both bubbled events
    // must NOT trigger row click since the kebab stops propagation.
    fireEvent.pointerDown(kebab, { button: 0 });
    fireEvent.click(kebab);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
