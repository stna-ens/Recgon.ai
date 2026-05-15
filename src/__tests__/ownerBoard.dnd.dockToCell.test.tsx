// Phase 3.5 / Plan 03.5-03 — Test 4: dock-row → cell drag fires BOTH assign + schedule.
//
// Strategy mirrors ownerBoard.dnd.reassign.test.tsx: mock @dnd-kit to capture
// onDragEnd, then invoke it with a synthetic DragEndEvent whose active.data
// carries kind='dock-row'. The triaged task starts unassigned with a
// triage_note — the drop should result in BOTH /assign + /schedule fetches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
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
      return React.createElement('div', { 'data-testid': 'mock-dnd-context' }, children);
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

const triagedTaskFixture = fixtureTask({
  id: 'task-triaged',
  title: 'Refactor auth module',
  status: 'unassigned',
  assignedTo: null,
  scheduledDate: null,
  triageNote: 'no_clear_fit',
});

describe('drag dock-row → cell (Test 4)', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    dndCaptured.onDragEnd = undefined;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));

    const fetchSpy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/recgon/owner/dock')) {
        return { ok: true, status: 200, json: async () => ({ triaged: [triagedTaskFixture], deferred: [] }) };
      }
      if (u.includes('/api/recgon/owner/board')) {
        return { ok: true, status: 200, json: async () => ({ teammates: [aliceTeammate, bobTeammate], tasks: [] }) };
      }
      if (u.includes('/assign')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      if (u.includes('/schedule')) {
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

  it('Test 4: dock row dragged to cell → BOTH /assign + /schedule fire', async () => {
    render(<OwnerWorkloadBoard teamId="team-1" />);
    await waitFor(() => expect(dndCaptured.onDragEnd).toBeTruthy());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-triaged', data: { current: { kind: 'dock-row' } } },
        over: { id: `${aliceTeammate.id}__2026-05-19` },
      } as unknown as DragEndEvent);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const assignCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/api/recgon/tasks/task-triaged/assign'),
    );
    const scheduleCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/api/teams/team-1/tasks/task-triaged/schedule'),
    );
    expect(assignCall).toBeTruthy();
    expect(scheduleCall).toBeTruthy();

    const assignBody = JSON.parse((assignCall![1] as { body: string }).body);
    expect(assignBody.assigneeId).toBe(aliceTeammate.id);
    const scheduleBody = JSON.parse((scheduleCall![1] as { body: string }).body);
    expect(scheduleBody.teammateId).toBe(aliceTeammate.id);
    expect(scheduleBody.scheduledDate).toBe('2026-05-19');

    // Toast for combined op.
    expect(toastSpy).toHaveBeenCalled();
    const toastMsg = toastSpy.mock.calls[0][0] as string;
    expect(toastMsg).toMatch(/assigned to alice on MAY 19/i);
  });
});
