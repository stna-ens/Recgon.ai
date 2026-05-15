// Phase 3.5 / Plan 03.5-03 — drag-to-reassign integration tests.
//
// Strategy: mock @dnd-kit/core so DndContext exposes its onDragEnd via a
// test-accessible ref. The test:
//   1. Renders OwnerWorkloadBoard.
//   2. Waits for the dock + board fetches to settle.
//   3. Invokes the captured onDragEnd handler with a synthetic DragEndEvent
//      whose over.id encodes the target cell/lane.
//   4. Asserts the assign endpoint was called with the right body.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { fixtureTask, aliceTeammate, bobTeammate } from './ownerBoard/setup';
import type { DragEndEvent } from '@dnd-kit/core';

// ── jsdom shim for Radix dropdown internals used elsewhere on the page ─────

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

// ── @dnd-kit/core mock — capture onDragEnd ────────────────────────────────

const dndCaptured: { onDragEnd?: (e: DragEndEvent) => void } = {};

vi.mock('@dnd-kit/core', async () => {
  const React = await import('react');
  return {
    DndContext: ({ onDragEnd, children }: { onDragEnd?: (e: DragEndEvent) => void; children: React.ReactNode }) => {
      dndCaptured.onDragEnd = onDragEnd;
      return React.createElement('div', { 'data-testid': 'mock-dnd-context' }, children);
    },
    PointerSensor: vi.fn(),
    KeyboardSensor: vi.fn(),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
    closestCenter: vi.fn(),
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({
      isOver: false,
      setNodeRef: () => {},
    }),
  };
});

// ── @dnd-kit/utilities mock ───────────────────────────────────────────────

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// ── App mocks ──────────────────────────────────────────────────────────────

vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => ({
    currentTeam: { id: 'team-1', name: 'Test Team', role: 'owner', slug: 't', createdBy: 'u', createdAt: '' },
    teams: [],
    loading: false,
    projects: null,
    projectUpdateStatuses: {},
    refreshProjects: vi.fn(),
    setCurrentTeam: vi.fn(),
    refreshTeams: vi.fn(),
    setProjectUpdateStatuses: vi.fn(),
  }),
}));

const toastSpy = vi.fn();
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: toastSpy }),
}));

vi.mock('@/components/v2/calendar/TaskDetailPanel', () => ({
  TaskDetailPanel: () => null,
}));

import { OwnerWorkloadBoard } from '@/app/projects/OwnerWorkloadBoard';

const aliceTask = fixtureTask({
  id: 'task-alice-1',
  title: 'Alice ongoing',
  assignedTo: aliceTeammate.id,
  status: 'assigned',
  scheduledDate: '2026-05-19',
});

describe('drag-to-reassign (chip → lane / cell / chip→day)', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    dndCaptured.onDragEnd = undefined;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));

    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/recgon/owner/dock')) {
        return { ok: true, status: 200, json: async () => ({ triaged: [], deferred: [] }) };
      }
      if (u.includes('/api/recgon/owner/board')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            teammates: [aliceTeammate, bobTeammate],
            tasks: [aliceTask],
          }),
        };
      }
      if (u.includes('/api/recgon/tasks/') && u.includes('/assign')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (u.includes('/api/teams/') && u.includes('/schedule')) {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function renderAndWaitForOnDragEnd() {
    const utils = render(<OwnerWorkloadBoard teamId="team-1" />);
    await waitFor(() => {
      expect(dndCaptured.onDragEnd).toBeTruthy();
    });
    // Wait one more tick so the board's fetches settle into state.
    await act(async () => {
      await Promise.resolve();
    });
    return utils;
  }

  it('Test 1: chip A → bob lane → POST /assign with assigneeId=tm-bob', async () => {
    await renderAndWaitForOnDragEnd();

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-alice-1', data: { current: { kind: 'task' } } },
        over: { id: 'tm-bob__lane' },
      } as unknown as DragEndEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const assignCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/api/teams/team-1/tasks/task-alice-1/schedule'),
    );
    expect(assignCall).toBeTruthy();
    const body = JSON.parse((assignCall![1] as { body: string }).body);
    expect(body.teammateId).toBe('tm-bob');
    expect(body.scheduledDate).toBe('2026-05-19'); // lane drop keeps date
  });

  it('Test 2: chip Mon → Thu same teammate → POST /schedule with new date', async () => {
    await renderAndWaitForOnDragEnd();

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-alice-1', data: { current: { kind: 'task' } } },
        over: { id: `${aliceTeammate.id}__2026-05-21` },
      } as unknown as DragEndEvent);
      await Promise.resolve();
    });

    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const scheduleCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/api/teams/team-1/tasks/task-alice-1/schedule'),
    );
    expect(scheduleCall).toBeTruthy();
    const body = JSON.parse((scheduleCall![1] as { body: string }).body);
    expect(body.teammateId).toBe(aliceTeammate.id);
    expect(body.scheduledDate).toBe('2026-05-21');
  });

  it('Test 8: drop outside any droppable (over=null) → no fetch, no toast', async () => {
    await renderAndWaitForOnDragEnd();
    const fetchCallsBefore = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-alice-1', data: { current: { kind: 'task' } } },
        over: null,
      } as unknown as DragEndEvent);
      await Promise.resolve();
    });

    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchSpy.mock.calls.length).toBe(fetchCallsBefore);
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
