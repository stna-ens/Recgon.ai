// Phase 3.5 / Plan 03.5-02 — OwnerWorkloadGrid render + chip-click contract.
//
// Tests:
//   12. Grid renders: 14 day-header cells, N lane labels, M chips in the right cells.
//   13. Chip click fires onChipClick with the task id.
//   14. SwimLane receives dragMode="dnd-kit" prop.
//   15. End-to-end OwnerWorkloadBoard render: dock + grid + deferred-appears-in-both.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  aliceTeammate,
  bobTeammate,
  fixtureTask,
  assignedTask,
  triagedTask,
  deferredTask,
} from './ownerBoard/setup';

// Mock SwimLane so we can inspect its props (Test 14) and also render a
// minimal stand-in that emits the chips so the visual tests still work.
const swimLaneSpy = vi.fn();
vi.mock('@/components/v2/calendar/SwimLane', () => ({
  SwimLane: (props: {
    teammate: { id: string; displayName: string };
    cards: Array<{ id: string; title: string; task: { id: string } }>;
    dayDates: Date[];
    dragMode?: string;
    onCardClick?: (card: { task: { id: string } }) => void;
  }) => {
    swimLaneSpy(props);
    return (
      <div data-testid={`lane-${props.teammate.id}`} data-drag-mode={props.dragMode ?? 'native'}>
        <span className="lane-name">{props.teammate.displayName}</span>
        {props.cards.map((c) => (
          <button
            type="button"
            key={c.id}
            data-testid={`chip-${c.task.id}`}
            className="cal-chip"
            onClick={() => props.onCardClick?.(c)}
          >
            {c.title}
          </button>
        ))}
      </div>
    );
  },
}));

import { OwnerWorkloadGrid } from '@/components/v2/projects/owner/OwnerWorkloadGrid';

const day = (iso: string) => new Date(`${iso}T00:00:00`);
const FOURTEEN_DAY_WINDOW = [
  day('2026-05-18'), day('2026-05-19'), day('2026-05-20'), day('2026-05-21'),
  day('2026-05-22'), day('2026-05-23'), day('2026-05-24'),
  day('2026-05-25'), day('2026-05-26'), day('2026-05-27'), day('2026-05-28'),
  day('2026-05-29'), day('2026-05-30'), day('2026-05-31'),
];

describe('OwnerWorkloadGrid — render (Test 12)', () => {
  beforeEach(() => {
    swimLaneSpy.mockReset();
  });

  it('renders 14 day-header cells, 2 lane labels, 3 chips placed in the correct lanes', () => {
    const alice = aliceTeammate; // tm-alice
    const bob = bobTeammate;     // tm-bob

    const aliceTaskA = fixtureTask({
      id: 'task-a1',
      title: 'Alice task one',
      assignedTo: alice.id,
      status: 'assigned',
      scheduledDate: '2026-05-18',
    });
    const aliceTaskB = fixtureTask({
      id: 'task-a2',
      title: 'Alice task two',
      assignedTo: alice.id,
      status: 'assigned',
      scheduledDate: '2026-05-20',
    });
    const bobTask = fixtureTask({
      id: 'task-b1',
      title: 'Bob task',
      assignedTo: bob.id,
      status: 'assigned',
      scheduledDate: '2026-05-25',
    });

    const { container } = render(
      <OwnerWorkloadGrid
        teammates={[alice, bob]}
        tasks={[aliceTaskA, aliceTaskB, bobTask]}
        dayDates={FOURTEEN_DAY_WINDOW}
        onChipClick={() => {}}
      />,
    );

    // 14 day-header cells.
    expect(container.querySelectorAll('.cal-day-header').length).toBe(14);

    // Two lane labels (SwimLane stub renders <span class="lane-name">).
    expect(container.querySelectorAll('.lane-name').length).toBe(2);

    // 3 chips total.
    expect(container.querySelectorAll('.cal-chip').length).toBe(3);

    // Each chip is in its lane's stub.
    const aliceLane = container.querySelector('[data-testid="lane-tm-alice"]');
    expect(aliceLane?.querySelector('[data-testid="chip-task-a1"]')).toBeTruthy();
    expect(aliceLane?.querySelector('[data-testid="chip-task-a2"]')).toBeTruthy();
    const bobLane = container.querySelector('[data-testid="lane-tm-bob"]');
    expect(bobLane?.querySelector('[data-testid="chip-task-b1"]')).toBeTruthy();
  });
});

describe('OwnerWorkloadGrid — chip click (Test 13)', () => {
  beforeEach(() => {
    swimLaneSpy.mockReset();
  });

  it('clicking a chip invokes onChipClick with the task id', () => {
    const onChipClick = vi.fn();
    const task = fixtureTask({
      id: 'task-clickable',
      title: 'click me',
      assignedTo: aliceTeammate.id,
      status: 'assigned',
      scheduledDate: '2026-05-18',
    });
    const { getByTestId } = render(
      <OwnerWorkloadGrid
        teammates={[aliceTeammate]}
        tasks={[task]}
        dayDates={FOURTEEN_DAY_WINDOW}
        onChipClick={onChipClick}
      />,
    );

    fireEvent.click(getByTestId('chip-task-clickable'));
    expect(onChipClick).toHaveBeenCalledTimes(1);
    expect(onChipClick).toHaveBeenCalledWith('task-clickable');
  });
});

describe('OwnerWorkloadGrid — dragMode (Test 14)', () => {
  beforeEach(() => {
    swimLaneSpy.mockReset();
  });

  it('passes dragMode="dnd-kit" to every SwimLane', () => {
    render(
      <OwnerWorkloadGrid
        teammates={[aliceTeammate, bobTeammate]}
        tasks={[]}
        dayDates={FOURTEEN_DAY_WINDOW}
        onChipClick={() => {}}
      />,
    );

    expect(swimLaneSpy).toHaveBeenCalled();
    swimLaneSpy.mock.calls.forEach(([props]) => {
      expect(props.dragMode).toBe('dnd-kit');
    });
  });
});

// Test 15: end-to-end OwnerWorkloadBoard render. Mock the dock + window
// fetches via fetch URL routing; assert dock + grid + deferred-in-both.

vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => ({
    currentTeam: { id: 'team-1', name: 'Test Team', role: 'owner', slug: 't', createdBy: 'u', createdAt: '2026-01-01T00:00:00Z' },
    teams: [],
    loading: false,
    projects: null,
    projectUpdateStatuses: {},
    refreshProjects: vi.fn(),
    setCurrentTeam: vi.fn(),
    refreshTeams: vi.fn().mockResolvedValue(undefined),
    setProjectUpdateStatuses: vi.fn(),
  }),
}));

vi.mock('@/components/v2/calendar/TaskDetailPanel', () => ({
  TaskDetailPanel: ({ task }: { task: { id: string } | null }) => (
    task ? <div data-testid="task-detail-panel">detail:{task.id}</div> : null
  ),
}));

import { OwnerWorkloadBoard } from '@/app/projects/OwnerWorkloadBoard';

describe('OwnerWorkloadBoard — end-to-end (Test 15)', () => {
  beforeEach(() => {
    swimLaneSpy.mockReset();

    // Fixed clock so the 14-day window includes 2026-05-18..2026-05-31 (assigned + deferred dates).
    // shouldAdvanceTime keeps the microtask queue draining so fetch promises resolve.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));

    const spy = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/recgon/owner/dock')) {
        // Deferred fixture needs a soft assignee so its chip can land in a
        // lane row in the grid (D-13: deferred appears in BOTH dock + grid).
        const deferredWithSoftAssignee = { ...deferredTask, assignedTo: aliceTeammate.id };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            triaged: [triagedTask],
            deferred: [deferredWithSoftAssignee],
          }),
        };
      }
      if (u.includes('/api/recgon/owner/board')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            teammates: [aliceTeammate, bobTeammate],
            tasks: [
              fixtureTask({
                id: 'task-alice-1',
                title: 'A1',
                assignedTo: aliceTeammate.id,
                status: 'assigned',
                scheduledDate: '2026-05-19',
              }),
              fixtureTask({
                id: 'task-bob-1',
                title: 'B1',
                assignedTo: bobTeammate.id,
                status: 'assigned',
                scheduledDate: '2026-05-22',
              }),
            ],
          }),
        };
      }
      if (u.includes('/api/teams/team-1/teammates')) {
        // Legacy Wave-1 endpoint kept available; the board may still call it.
        return {
          ok: true,
          status: 200,
          json: async () => ({ teammates: [aliceTeammate, bobTeammate] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
    });
    vi.stubGlobal('fetch', spy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders dock with 2 rows (triaged + deferred), grid with 2 assigned chips, and the deferred task ALSO in the grid (D-13)', async () => {
    const { container } = render(<OwnerWorkloadBoard teamId="team-1" />);

    // Wait for both fetches to resolve and components to render.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="triage-dock"]')).toBeTruthy();
    });

    // Dock expanded with 2 rows.
    const dock = container.querySelector('[data-testid="triage-dock"]')!;
    expect(dock.className).not.toContain('is-collapsed');
    await waitFor(() => {
      const dockItems = dock.querySelectorAll('[role="listitem"]');
      expect(dockItems.length).toBe(2);
    });

    // Grid contains the two assigned chips.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="chip-task-alice-1"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="chip-task-bob-1"]')).toBeTruthy();
    });

    // D-13: deferred task ALSO appears in the grid (alongside the dock).
    await waitFor(() => {
      expect(container.querySelector('[data-testid="chip-task-deferred"]')).toBeTruthy();
    });
  });
});
