// Phase 3.5 / Plan 03.5-02 — TriageDock + TriageDockRow render contract.
//
// Locks the D-14 reason-copy mapping + UI-SPEC §6 collapsed/expanded states.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TriageDock } from '@/components/v2/projects/owner/TriageDock';
import { TriageDockRow } from '@/components/v2/projects/owner/TriageDockRow';
import { fixtureTask, triagedTask, deferredTask } from './ownerBoard/setup';

describe('TriageDock — collapsed/expanded states (UI-SPEC §6)', () => {
  it('renders a 40px-tall "TRIAGE · CLEAR" pill when both buckets are empty', () => {
    const { container, getByText } = render(<TriageDock triaged={[]} deferred={[]} />);
    expect(getByText('TRIAGE · CLEAR')).toBeTruthy();
    // Collapsed state marker (we use a class hook for the height + signature glow).
    const root = container.querySelector('[data-testid="triage-dock"]');
    expect(root).toBeTruthy();
    expect(root?.className).toContain('is-collapsed');
    // No list items should render in the collapsed state.
    expect(container.querySelectorAll('[role="listitem"]').length).toBe(0);
  });

  it('renders an expanded card with "TRIAGE · 1 NEEDS YOUR EYES" header + 1 row for a single triaged task', () => {
    const { container, getByText, getAllByRole } = render(
      <TriageDock triaged={[triagedTask]} deferred={[]} />,
    );
    expect(getByText('TRIAGE · 1 NEEDS YOUR EYES')).toBeTruthy();
    expect(getByText('Refactor auth module')).toBeTruthy();
    expect(getByText('no clear fit')).toBeTruthy();
    // Exactly one row.
    expect(getAllByRole('listitem').length).toBe(1);
    // Not collapsed.
    const root = container.querySelector('[data-testid="triage-dock"]');
    expect(root?.className).not.toContain('is-collapsed');
  });

  it('renders deferred row with "deferred → MMM D" copy in uppercase month', () => {
    const { getByText } = render(<TriageDock triaged={[]} deferred={[deferredTask]} />);
    expect(getByText('TRIAGE · 1 NEEDS YOUR EYES')).toBeTruthy();
    expect(getByText('Investigate prod log')).toBeTruthy();
    // The deferred date 2026-05-22 → "MAY 22"
    const dockEl = document.querySelector('[data-testid="triage-dock"]');
    expect(dockEl?.textContent).toMatch(/deferred\s*→\s*MAY 22/);
  });

  it('renders count = triaged + deferred with both buckets present', () => {
    const triagedA = fixtureTask({ id: 't-a', title: 'A', status: 'unassigned', assignedTo: null, scheduledDate: null, triageNote: 'no_clear_fit' });
    const triagedB = fixtureTask({ id: 't-b', title: 'B', status: 'unassigned', assignedTo: null, scheduledDate: null, triageNote: 'no_grounded_reason' });
    const deferredA = fixtureTask({ id: 'd-a', title: 'C', status: 'unassigned', assignedTo: null, scheduledDate: '2026-05-22', triageNote: null });
    const deferredB = fixtureTask({ id: 'd-b', title: 'D', status: 'unassigned', assignedTo: null, scheduledDate: '2026-05-25', triageNote: null });
    const deferredC = fixtureTask({ id: 'd-c', title: 'E', status: 'unassigned', assignedTo: null, scheduledDate: '2026-05-26', triageNote: null });
    const { getByText, getAllByRole } = render(
      <TriageDock triaged={[triagedA, triagedB]} deferred={[deferredA, deferredB, deferredC]} />,
    );
    expect(getByText('TRIAGE · 5 NEEDS YOUR EYES')).toBeTruthy();
    expect(getAllByRole('listitem').length).toBe(5);
  });
});

describe('TriageDockRow — reason copy mapping (D-14)', () => {
  const cases: Array<{ note: 'no_clear_fit' | 'no_grounded_reason' | 'no_capacity_in_window' | 'no_capacity_high_priority'; expected: string }> = [
    { note: 'no_clear_fit', expected: 'no clear fit' },
    { note: 'no_grounded_reason', expected: 'no grounded reason' },
    { note: 'no_capacity_in_window', expected: 'qualified but booked through 4 wks' },
    { note: 'no_capacity_high_priority', expected: 'high-priority + no capacity now' },
  ];
  cases.forEach(({ note, expected }) => {
    it(`triage_note='${note}' renders "${expected}" and NO dismiss slot`, () => {
      const task = fixtureTask({
        id: `task-${note}`,
        title: `Task ${note}`,
        status: 'unassigned',
        assignedTo: null,
        scheduledDate: null,
        triageNote: note,
      });
      const { getByText, queryByTestId } = render(
        <TriageDockRow task={task} isDeferred={false} />,
      );
      expect(getByText(expected)).toBeTruthy();
      expect(getByText(`Task ${note}`)).toBeTruthy();
      // Triaged rows DO NOT expose a dismiss slot.
      expect(queryByTestId('triage-row-dismiss')).toBeNull();
    });
  });

  it('deferred row renders "deferred → MAY 22" copy AND a dismiss slot', () => {
    const task = fixtureTask({
      id: 'deferred-row',
      title: 'Deferred work',
      status: 'unassigned',
      assignedTo: null,
      scheduledDate: '2026-05-22',
      triageNote: null,
    });
    const { container, getByTestId } = render(<TriageDockRow task={task} isDeferred={true} />);
    expect(container.textContent).toMatch(/deferred\s*→\s*MAY 22/);
    expect(getByTestId('triage-row-dismiss')).toBeTruthy();
  });
});
