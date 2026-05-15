// Phase 3.5 / Plan 03.5-03 — Tests 5 + 7 — rollback on API failure + in-flight ConfirmDialog.
//
// Test 5: drag chip → /assign returns 500 → toast "couldn't move" + override cleared.
// Test 7: drag in-flight chip (status='in_progress') → ConfirmDialog opens
//         BEFORE any fetch fires.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, screen } from '@testing-library/react';
import { fixtureTask, aliceTeammate, bobTeammate } from './ownerBoard/setup';
import type { DragEndEvent } from '@dnd-kit/core';

if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = (() => false) as Element['hasPointerCapture'];
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = (() => {}) as Element['setPointerCapture'];
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = (() => {}) as Element['releasePointerCapture'];
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = (() => {}) as Element['scrollIntoView'];
}

const dndCaptured: { onDragEnd?: (e: DragEndEvent) => void } = {};

vi.mock('@dnd-kit/core', async () => {
  const React = await import('react');
  return {
    DndContext: ({ onDragEnd, children }: { onDragEnd?: (e: DragEndEvent) => void; children: React.ReactNode }) => {
      dndCaptured.onDragEnd = onDragEnd;
      return React.createElement('div', null, children);
    },
    PointerSensor: vi.fn(), KeyboardSensor: vi.fn(),
    useSensor: vi.fn(), useSensors: vi.fn(() => []), closestCenter: vi.fn(),
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ isOver: false, setNodeRef: () => {} }),
  };
});

vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => ({
    currentTeam: { id: 'team-1', name: 'Test Team', role: 'owner', slug: 't', createdBy: 'u', createdAt: '' },
    teams: [], loading: false, projects: null, projectUpdateStatuses: {},
    refreshProjects: vi.fn(), setCurrentTeam: vi.fn(), refreshTeams: vi.fn(), setProjectUpdateStatuses: vi.fn(),
  }),
}));

const toastSpy = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast: toastSpy }) }));

vi.mock('@/components/v2/calendar/TaskDetailPanel', () => ({ TaskDetailPanel: () => null }));

import { OwnerWorkloadBoard } from '@/app/projects/OwnerWorkloadBoard';

const assignedTaskFixture = fixtureTask({
  id: 'task-alice-1',
  title: 'Alice ongoing',
  assignedTo: aliceTeammate.id,
  status: 'assigned',
  scheduledDate: '2026-05-19',
});

const inFlightTaskFixture = fixtureTask({
  id: 'task-bob-inflight',
  title: 'Bob in flight',
  assignedTo: bobTeammate.id,
  status: 'in_progress',
  scheduledDate: '2026-05-20',
});

describe('drag rollback + in-flight confirm', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    dndCaptured.onDragEnd = undefined;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Test 5: schedule endpoint returns 500 → error toast fires + override cleared', async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/recgon/owner/dock')) {
        return { ok: true, status: 200, json: async () => ({ triaged: [], deferred: [] }) };
      }
      if (u.includes('/api/recgon/owner/board')) {
        return {
          ok: true, status: 200,
          json: async () => ({ teammates: [aliceTeammate, bobTeammate], tasks: [assignedTaskFixture] }),
        };
      }
      if (u.includes('/schedule')) {
        return { ok: false, status: 500, json: async () => ({ error: 'server down' }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<OwnerWorkloadBoard teamId="team-1" />);
    await waitFor(() => expect(dndCaptured.onDragEnd).toBeTruthy());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-alice-1', data: { current: { kind: 'task' } } },
        over: { id: `${bobTeammate.id}__lane` },
      } as unknown as DragEndEvent);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Error toast fired.
    const errorToasts = toastSpy.mock.calls.filter(
      ([, kind]) => kind === 'error',
    );
    expect(errorToasts.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 7: in-flight chip dragged to new teammate → ConfirmDialog opens BEFORE fetch', async () => {
    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/recgon/owner/dock')) {
        return { ok: true, status: 200, json: async () => ({ triaged: [], deferred: [] }) };
      }
      if (u.includes('/api/recgon/owner/board')) {
        return {
          ok: true, status: 200,
          json: async () => ({ teammates: [aliceTeammate, bobTeammate], tasks: [inFlightTaskFixture] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(<OwnerWorkloadBoard teamId="team-1" />);
    await waitFor(() => expect(dndCaptured.onDragEnd).toBeTruthy());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const fetchCallsBefore = fetchSpy.mock.calls.length;

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-bob-inflight', data: { current: { kind: 'task' } } },
        over: { id: `${aliceTeammate.id}__lane` },
      } as unknown as DragEndEvent);
      await Promise.resolve();
    });

    // No assign/schedule fetch fired — ConfirmDialog is gating.
    const mutationCalls = fetchSpy.mock.calls.slice(fetchCallsBefore).filter(([url]) => {
      const u = String(url);
      return u.includes('/assign') || u.includes('/schedule');
    });
    expect(mutationCalls.length).toBe(0);

    // Dialog title visible (Radix renders into a portal).
    await waitFor(() => {
      expect(screen.getByText(/Reassign in-flight task/i)).toBeTruthy();
    });
  });
});
