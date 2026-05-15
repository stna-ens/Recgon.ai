// Phase 3.5 / Plan 03.5-03 — dock dismiss button render + handler contract.
//
// Tests:
//   4. Render: TriageDockRow with isDeferred=true renders a × button keyed by task id; isDeferred=false hides it.
//   5. Click: clicking × calls onDismiss(taskId).
//   6. Triaged rows have no × even with onDismiss passed (defensive).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TriageDockRow } from '@/components/v2/projects/owner/TriageDockRow';
import { fixtureTask } from './ownerBoard/setup';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TriageDockRow — dismiss button (Test 4-6)', () => {
  it('Test 4a: deferred row renders the dismiss × button keyed by task id', () => {
    const task = fixtureTask({
      id: 'def-1',
      title: 'Deferred task',
      status: 'unassigned',
      assignedTo: null,
      scheduledDate: '2026-05-22',
      triageNote: null,
    });
    render(<TriageDockRow task={task} isDeferred={true} teammates={[]} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('triage-row-dismiss-def-1')).toBeTruthy();
  });

  it('Test 4b: triaged row does NOT render the dismiss × button', () => {
    const task = fixtureTask({
      id: 'tri-1',
      title: 'Triaged task',
      status: 'unassigned',
      assignedTo: null,
      scheduledDate: null,
      triageNote: 'no_clear_fit',
    });
    const { container } = render(
      <TriageDockRow task={task} isDeferred={false} teammates={[]} onDismiss={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="triage-row-dismiss-tri-1"]')).toBeNull();
  });

  it('Test 5: clicking × calls onDismiss(taskId)', async () => {
    const onDismiss = vi.fn(async () => undefined);
    const task = fixtureTask({
      id: 'def-1',
      title: 'Deferred task',
      status: 'unassigned',
      assignedTo: null,
      scheduledDate: '2026-05-22',
      triageNote: null,
    });
    render(<TriageDockRow task={task} isDeferred={true} teammates={[]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('triage-row-dismiss-def-1'));
    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('def-1');
    });
  });
});
