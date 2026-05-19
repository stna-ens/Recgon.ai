// Phase 3.6 / Plan 03 — overdueRunner integration test.
//
// Exercises the side-effect dispatcher (overdueRunner.executeOverdueAction)
// against a fully-mocked Supabase + Resend stack and an injected clock.
// Also covers the storage helpers (markOverdueAction, snoozeTask) and the
// double-run idempotency contract: a second sweep within the cool-down
// window must NOT fire duplicate emails OR duplicate event-log rows.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgentTask, OverdueAction, TeammateWithStats } from '../lib/recgon/types';

// ── Mocks (declared first; vi.mock is hoisted) ─────────────────────────────

vi.mock('../lib/recgon/storage', async () => {
  const actual = await vi.importActual<typeof import('../lib/recgon/storage')>(
    '../lib/recgon/storage',
  );
  return {
    ...actual,
    // The runner imports these from storage. We stub them so calls are
    // observable + deterministic.
    markOverdueAction: vi.fn().mockResolvedValue(undefined),
    setTaskSchedule: vi.fn().mockResolvedValue(undefined),
    reassignTask: vi.fn().mockResolvedValue(undefined),
    loadHoursByDateForTeammate: vi.fn().mockResolvedValue({}),
    loadHoursByDateForUser: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../lib/email', () => ({
  sendOverdueNudge: vi.fn().mockResolvedValue(undefined),
  sendOverdueEscalation: vi.fn().mockResolvedValue(undefined),
  sendAutoReschedulNotice: vi.fn().mockResolvedValue(undefined),
}));

// scheduler is real for the happy path, then we monkey-patch per test for
// the no-capacity branch.
vi.mock('../lib/recgon/scheduler', async () => {
  const actual = await vi.importActual<typeof import('../lib/recgon/scheduler')>(
    '../lib/recgon/scheduler',
  );
  return {
    ...actual,
    planTaskSchedule: vi.fn(),
  };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { email: 'assignee@example.com' },
          }),
        })),
      })),
    })),
  },
}));

// ── Now-import the modules under test ──────────────────────────────────────

import { executeOverdueAction } from '../lib/recgon/overdueRunner';
import {
  markOverdueAction as mockedMarkOverdueAction,
  setTaskSchedule as mockedSetTaskSchedule,
  reassignTask as mockedReassignTask,
} from '../lib/recgon/storage';
import {
  sendOverdueNudge as mockedSendOverdueNudge,
  sendOverdueEscalation as mockedSendOverdueEscalation,
  sendAutoReschedulNotice as mockedSendAutoReschedulNotice,
} from '../lib/email';
import { planTaskSchedule as mockedPlanTaskSchedule } from '../lib/recgon/scheduler';
import { decideOverdueAction } from '../lib/recgon/overduePolicy';

// ── Fixtures ───────────────────────────────────────────────────────────────

const TODAY = new Date('2026-05-19T12:00:00.000Z');

function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 'team-1',
    projectId: null,
    title: 'Ship the overdue UI banner',
    description: 'Add the overdue banner to the inbox page',
    kind: 'next_step',
    source: 'brain',
    sourceRef: {},
    requiredSkills: [],
    priority: 2,
    estimatedHours: 2,
    deadline: null,
    assignedTo: 'tm-1',
    assignedBy: 'recgon',
    assignedAt: '2026-05-10T00:00:00Z',
    status: 'assigned',
    jobId: null,
    result: null,
    createdBy: 'recgon',
    createdAt: '2026-05-10T00:00:00Z',
    completedAt: null,
    proof: null,
    verificationStatus: 'none',
    verificationEvidence: null,
    verifiedAt: null,
    verifiedBy: null,
    scheduledDate: '2026-05-17', // 2 days overdue → tier 1
    scheduledUntilDate: null,
    scheduleNote: null,
    rescheduleRequestStatus: 'none',
    rescheduleRequestedAt: null,
    rescheduleRequestedBy: null,
    rescheduleRequestNote: null,
    rescheduleRequestedDate: null,
    assignmentReasoning: null,
    triageNote: null,
    ...overrides,
  };
}

function buildTeammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: 'tm-1',
    teamId: 'team-1',
    userId: 'user-tm-1',
    displayName: 'Alex',
    avatarColor: null,
    avatarUrl: null,
    title: null,
    skills: ['frontend'],
    capacityHours: 20,
    workingHours: { days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    fitProfile: {},
    status: 'active',
    createdAt: '2026-04-01T00:00:00Z',
    stars: 4,
    ratingCount: 5,
    upCount: 4,
    downCount: 1,
    inFlightCount: 1,
    inFlightHours: 2,
    teamRole: 'member',
    ...overrides,
  };
}

const OWNER = {
  userId: 'user-owner',
  email: 'owner@example.com',
  nickname: 'Sam',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tier 1 — nudge ─────────────────────────────────────────────────────────

describe('executeOverdueAction — tier 1 (nudge_teammate)', () => {
  it('emails the assignee, records nudged event, bumps tier to 1', async () => {
    const task = buildTask({ scheduledDate: '2026-05-17' }); // 2 days overdue
    const action: OverdueAction = { kind: 'nudge_teammate', tier: 1 };

    await executeOverdueAction(task, action, buildTeammate(), OWNER, TODAY);

    expect(mockedSendOverdueNudge).toHaveBeenCalledTimes(1);
    expect(mockedSendOverdueNudge).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'assignee@example.com',
        taskTitle: task.title,
        daysOverdue: 2,
      }),
    );
    expect(mockedSendOverdueEscalation).not.toHaveBeenCalled();
    expect(mockedSendAutoReschedulNotice).not.toHaveBeenCalled();

    expect(mockedMarkOverdueAction).toHaveBeenCalledTimes(1);
    expect(mockedMarkOverdueAction).toHaveBeenCalledWith(
      task.id,
      1,
      'nudged',
      expect.objectContaining({
        teamId: 'team-1',
        teammateId: 'tm-1',
        daysOverdue: 2,
      }),
    );
  });
});

// ── Tier 2 — escalate ──────────────────────────────────────────────────────

describe('executeOverdueAction — tier 2 (escalate_to_owner)', () => {
  it('emails the owner (NOT the assignee), records escalated event, bumps tier to 2', async () => {
    const task = buildTask({ scheduledDate: '2026-05-14' }); // 5 days overdue
    const action: OverdueAction = { kind: 'escalate_to_owner', tier: 2 };

    await executeOverdueAction(task, action, buildTeammate(), OWNER, TODAY);

    expect(mockedSendOverdueEscalation).toHaveBeenCalledTimes(1);
    expect(mockedSendOverdueEscalation).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        assigneeName: 'Alex',
        taskTitle: task.title,
        daysOverdue: 5,
      }),
    );
    expect(mockedSendOverdueNudge).not.toHaveBeenCalled();
    expect(mockedSendAutoReschedulNotice).not.toHaveBeenCalled();

    expect(mockedMarkOverdueAction).toHaveBeenCalledWith(
      task.id,
      2,
      'escalated',
      expect.objectContaining({ daysOverdue: 5, ownerUserId: 'user-owner' }),
    );
  });
});

// ── Tier 3 — auto_reschedule ───────────────────────────────────────────────

describe('executeOverdueAction — tier 3 (auto_reschedule)', () => {
  it('with capacity: rewrites the schedule, notifies assignee, preserves original date in note', async () => {
    (mockedPlanTaskSchedule as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scheduledDate: '2026-05-25',
      deadline: '2026-05-25T23:59:59Z',
      scheduleNote: '2h reserved on 2026-05-25 from this teammate\'s daily capacity.',
    });
    const task = buildTask({ scheduledDate: '2026-05-10' }); // 9 days overdue
    const action: OverdueAction = { kind: 'auto_reschedule', tier: 3 };

    await executeOverdueAction(task, action, buildTeammate(), OWNER, TODAY);

    expect(mockedSetTaskSchedule).toHaveBeenCalledTimes(1);
    const call = (mockedSetTaskSchedule as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('task-1');
    expect(call[1].scheduledDate).toBe('2026-05-25');
    expect(call[1].scheduleNote).toContain('2026-05-10'); // original date preserved
    expect(call[1].scheduleNote).toContain('9d overdue'); // original lateness preserved

    expect(mockedSendAutoReschedulNotice).toHaveBeenCalledTimes(1);
    expect(mockedSendAutoReschedulNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'assignee@example.com',
        newDate: '2026-05-25',
      }),
    );
    expect(mockedReassignTask).not.toHaveBeenCalled();

    expect(mockedMarkOverdueAction).toHaveBeenCalledWith(
      task.id,
      3,
      'auto_rescheduled',
      expect.objectContaining({
        previousScheduledDate: '2026-05-10',
        newScheduledDate: '2026-05-25',
        daysOverdue: 9,
      }),
    );
  });

  it('without capacity: falls back to reassignTask(null) and skips the email', async () => {
    (mockedPlanTaskSchedule as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const task = buildTask({ scheduledDate: '2026-05-10' }); // 9 days overdue
    const action: OverdueAction = { kind: 'auto_reschedule', tier: 3 };

    await executeOverdueAction(task, action, buildTeammate(), OWNER, TODAY);

    expect(mockedSetTaskSchedule).not.toHaveBeenCalled();
    expect(mockedSendAutoReschedulNotice).not.toHaveBeenCalled();
    expect(mockedReassignTask).toHaveBeenCalledTimes(1);
    const call = (mockedReassignTask as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('task-1');
    expect(call[1]).toBeNull();
    expect(call[2]).toBe('recgon');
    expect(call[3].scheduleNote).toContain('no capacity');

    expect(mockedMarkOverdueAction).toHaveBeenCalledWith(
      task.id,
      3,
      'auto_rescheduled',
      expect.objectContaining({
        previousScheduledDate: '2026-05-10',
        newScheduledDate: null,
        handoff: 'unassigned_no_capacity',
      }),
    );
  });
});

// ── No-op (action.kind === 'none') ─────────────────────────────────────────

describe('executeOverdueAction — none', () => {
  it('does nothing for kind=none', async () => {
    const task = buildTask();
    await executeOverdueAction(task, { kind: 'none' }, buildTeammate(), OWNER, TODAY);
    expect(mockedSendOverdueNudge).not.toHaveBeenCalled();
    expect(mockedSendOverdueEscalation).not.toHaveBeenCalled();
    expect(mockedSendAutoReschedulNotice).not.toHaveBeenCalled();
    expect(mockedMarkOverdueAction).not.toHaveBeenCalled();
  });
});

// ── Cool-down (double-run idempotency) ─────────────────────────────────────
//
// We exercise the pure policy directly to prove the contract: once a task
// has `last_overdue_action_at` set within 24h, the policy returns `none`
// and the runner is never invoked. This is the same gate the cron route
// relies on for "two sweeps in the same minute = 0 duplicates".

describe('decideOverdueAction — cool-down (idempotency)', () => {
  it('returns none on second pass within 24h of last action', () => {
    const firstPass = decideOverdueAction({
      task: {
        id: 'task-1',
        status: 'assigned',
        scheduledDate: '2026-05-17',
        scheduledUntilDate: null,
        assignedTo: 'tm-1',
        overdueTier: 0,
        lastOverdueActionAt: null,
      },
      teamOverduePressureEnabled: true,
      today: TODAY,
    });
    expect(firstPass.kind).toBe('nudge_teammate');

    // Simulate the storage write that markOverdueAction would have made:
    // tier=1, lastOverdueActionAt = now.
    const justActioned = TODAY.toISOString();
    const secondPass = decideOverdueAction({
      task: {
        id: 'task-1',
        status: 'assigned',
        scheduledDate: '2026-05-17',
        scheduledUntilDate: null,
        assignedTo: 'tm-1',
        overdueTier: 1,
        lastOverdueActionAt: justActioned,
      },
      teamOverduePressureEnabled: true,
      // Same minute → cool-down trips.
      today: new Date(TODAY.getTime() + 60 * 1000),
    });
    expect(secondPass.kind).toBe('none');
  });

  it('runner is NEVER called when policy returns none — zero side effects', async () => {
    const task = buildTask({ scheduledDate: '2026-05-17' });
    const action = decideOverdueAction({
      task: {
        id: task.id,
        status: task.status,
        scheduledDate: task.scheduledDate,
        scheduledUntilDate: task.scheduledUntilDate,
        assignedTo: task.assignedTo,
        overdueTier: 1,
        lastOverdueActionAt: TODAY.toISOString(),
      },
      teamOverduePressureEnabled: true,
      today: new Date(TODAY.getTime() + 30 * 1000),
    });
    expect(action.kind).toBe('none');

    // Caller short-circuits on `none` BEFORE invoking the runner.
    if (action.kind !== 'none') {
      await executeOverdueAction(task, action, buildTeammate(), OWNER, TODAY);
    }

    expect(mockedSendOverdueNudge).not.toHaveBeenCalled();
    expect(mockedSendOverdueEscalation).not.toHaveBeenCalled();
    expect(mockedSendAutoReschedulNotice).not.toHaveBeenCalled();
    expect(mockedMarkOverdueAction).not.toHaveBeenCalled();
  });
});

// ── Snooze API contract ────────────────────────────────────────────────────
//
// snoozeTask hits real Supabase, so we test its observable contract via the
// query builder mock: assert the update payload pushes the date by N days,
// resets the tier, and writes a 'snoozed' event-log row. This isolates the
// pure shift math from the network call.

describe('snoozeTask — date shift + tier reset + event row', () => {
  it('advances scheduled_date by N days, clears tier + cool-down, logs snoozed', async () => {
    // Stateful capture: stub the supabase client by replacing methods on
    // the imported singleton. Avoids vi.resetModules (which races with the
    // top-level vi.mock of '../lib/recgon/storage').
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];

    const supabaseMod = await import('../lib/supabase');
    type MutableClient = { from: unknown };
    const originalFrom = supabaseMod.supabase.from;
    (supabaseMod.supabase as unknown as MutableClient).from = vi.fn((table: string) => {
      if (table === 'agent_tasks') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  team_id: 'team-1',
                  assigned_to: 'tm-1',
                  scheduled_date: '2026-05-17',
                  scheduled_until_date: null,
                },
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
        };
      }
      if (table === 'teammate_event_log') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            inserts.push(payload);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
        })),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    // The top-level vi.mock of '../lib/recgon/storage' uses ...actual so
    // snoozeTask is the REAL implementation; it'll hit our patched supabase.
    const storage = await vi.importActual<typeof import('../lib/recgon/storage')>(
      '../lib/recgon/storage',
    );

    try {
      await storage.snoozeTask('task-1', 3);

      expect(updates).toHaveLength(1);
      expect(updates[0].scheduled_date).toBe('2026-05-20'); // 17 + 3
      expect(updates[0].overdue_tier).toBe(0);
      expect(updates[0].last_overdue_action_at).toBeNull();
      expect(typeof updates[0].schedule_note).toBe('string');
      expect((updates[0].schedule_note as string).toLowerCase()).toContain('snoozed');

      expect(inserts).toHaveLength(1);
      expect(inserts[0].event).toBe('snoozed');
      expect(inserts[0].task_id).toBe('task-1');
      expect((inserts[0].payload as Record<string, unknown>).days).toBe(3);
      expect((inserts[0].payload as Record<string, unknown>).previousScheduledDate).toBe('2026-05-17');
      expect((inserts[0].payload as Record<string, unknown>).newScheduledDate).toBe('2026-05-20');
    } finally {
      (supabaseMod.supabase as unknown as MutableClient).from = originalFrom;
    }
  });
});
