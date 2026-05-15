// Phase 3.5 / Plan 03.5-04 — view toggle wiring.
//
// Locks the contract:
//   - Default mode = 'workload' → OwnerWorkloadGrid mounted, TableBoard absent.
//   - Click view-toggle trigger → menu opens → click "table" → TableBoard
//     mounted, OwnerWorkloadGrid absent.
//   - TriageDock stays mounted across both modes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// jsdom shim for Radix pointer-capture APIs.
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

// Mock TeamProvider so isOwner is true and projects array is available.
vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => ({
    currentTeam: {
      id: 'team-1',
      name: 'Test Team',
      role: 'owner',
      slug: 'test-team',
      createdBy: 'user-owner',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    teams: [],
    loading: false,
    projects: [{ id: 'project-1', name: 'Recgon' }],
    projectUpdateStatuses: {},
    refreshProjects: vi.fn(),
    setCurrentTeam: vi.fn(),
    refreshTeams: vi.fn().mockResolvedValue(undefined),
    setProjectUpdateStatuses: vi.fn(),
  }),
}));

// Mock Toast so addToast is a spy.
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { OwnerWorkloadBoard } from '@/app/projects/OwnerWorkloadBoard';
import {
  aliceTeammate,
  bobTeammate,
  fixtureTask,
  triagedTask,
  deferredTask,
} from './ownerBoard/setup';

beforeEach(() => {
  vi.clearAllMocks();
});

function mockBoardFetch() {
  const dockPayload = {
    triaged: [triagedTask],
    deferred: [deferredTask],
  };
  const assignedFixture = fixtureTask({
    id: 'task-assigned-1',
    title: 'Already assigned',
    assignedTo: 'tm-alice',
    status: 'assigned',
    scheduledDate: '2026-05-18',
  });
  const boardPayload = {
    teammates: [aliceTeammate, bobTeammate],
    tasks: [assignedFixture],
  };
  const spy = vi.fn(async (url: unknown) => {
    const u = typeof url === 'string' ? url : '';
    if (u.includes('/api/recgon/owner/dock')) {
      return { ok: true, status: 200, json: async () => dockPayload };
    }
    if (u.includes('/api/recgon/owner/board')) {
      return { ok: true, status: 200, json: async () => boardPayload };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('OwnerWorkloadBoard — view toggle (Plan 03.5-04 Task 2)', () => {
  it('default mode is "workload": OwnerWorkloadGrid mounted, TableBoard absent', async () => {
    mockBoardFetch();
    render(<OwnerWorkloadBoard teamId="team-1" />);

    // Wait for fetch to settle and the grid to mount.
    await waitFor(() => {
      expect(document.querySelector('[data-testid="owner-workload-grid"]')).toBeTruthy();
    });

    expect(document.querySelector('[data-testid="owner-workload-grid"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="owner-table-board"]')).toBeNull();
    expect(document.querySelector('[data-testid="triage-dock"]')).toBeTruthy();
  });

  it('clicking the view-toggle and selecting "table" swaps in TableBoard and unmounts the workload grid; TriageDock stays mounted', async () => {
    mockBoardFetch();
    render(<OwnerWorkloadBoard teamId="team-1" />);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="owner-workload-grid"]')).toBeTruthy();
    });

    // Open the view-toggle menu.
    const trigger = screen.getByTestId('owner-view-toggle-trigger');
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);

    // Select "table".
    await waitFor(() => {
      expect(screen.getByTestId('owner-view-toggle-option-table')).toBeTruthy();
    });
    const tableOption = screen.getByTestId('owner-view-toggle-option-table');
    fireEvent.pointerDown(tableOption, { button: 0 });
    fireEvent.click(tableOption);

    // After toggle: TableBoard mounted, OwnerWorkloadGrid unmounted, TriageDock still mounted.
    await waitFor(() => {
      expect(document.querySelector('[data-testid="owner-table-board"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-testid="owner-workload-grid"]')).toBeNull();
    expect(document.querySelector('[data-testid="triage-dock"]')).toBeTruthy();
  });
});
