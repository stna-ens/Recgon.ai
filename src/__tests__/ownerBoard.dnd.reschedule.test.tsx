// Phase 3.5 / Plan 03.5-03 — Test 3: chip → cell (different teammate + different date) fires BOTH paths.
//
// This case is the "combined op" path: assigneeChanged=true AND dateChanged=true
// on an already-assigned chip. Only the /schedule endpoint is used (since the
// chip is already assigned), with the new teammateId + new scheduledDate.

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

const aliceTask = fixtureTask({
  id: 'task-alice-1',
  title: 'A1',
  assignedTo: aliceTeammate.id,
  status: 'assigned',
  scheduledDate: '2026-05-19',
});

describe('drag chip → cell with different teammate AND different date (Test 3)', () => {
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
        return { ok: true, status: 200, json: async () => ({ teammates: [aliceTeammate, bobTeammate], tasks: [aliceTask] }) };
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

  it('Test 3: chip alice/19 → cell bob/21 → schedule endpoint receives teammateId=bob + date=05-21', async () => {
    render(<OwnerWorkloadBoard teamId="team-1" />);
    await waitFor(() => expect(dndCaptured.onDragEnd).toBeTruthy());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      dndCaptured.onDragEnd!({
        active: { id: 'task-alice-1', data: { current: { kind: 'task' } } },
        over: { id: `${bobTeammate.id}__2026-05-21` },
      } as unknown as DragEndEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const fetchSpy = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const scheduleCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/api/teams/team-1/tasks/task-alice-1/schedule'),
    );
    expect(scheduleCall).toBeTruthy();
    const body = JSON.parse((scheduleCall![1] as { body: string }).body);
    expect(body.teammateId).toBe(bobTeammate.id);
    expect(body.scheduledDate).toBe('2026-05-21');

    // Combined-op toast.
    const successToast = toastSpy.mock.calls.find(([, kind]) => kind === 'success');
    expect(successToast).toBeTruthy();
    expect(String(successToast![0])).toMatch(/assigned to bob on MAY 21/i);
  });
});
