import { describe, expect, it } from 'vitest';
import {
  ACTIVE_OVERDUE_STATUSES,
  daysOverdue,
  decideOverdueAction,
  isOverdue,
  type OverdueDecisionInput,
} from '../lib/recgon/overduePolicy';
import type { AgentTask } from '../lib/recgon/types';

// Fixed reference clock: 2026-05-19T12:00:00Z (a Tuesday).
const TODAY = new Date('2026-05-19T12:00:00.000Z');
const TODAY_KEY = '2026-05-19';

// Flat partial of the task snapshot fields — avoids the Pick&{extra} typing
// dance that tsc rejects when used through Partial<>.
type TaskOverride = {
  id?: string;
  status?: AgentTask['status'];
  scheduledDate?: string | null;
  scheduledUntilDate?: string | null;
  assignedTo?: string | null;
  overdueTier?: 0 | 1 | 2 | 3;
  lastOverdueActionAt?: string | null;
};

// Convenience: build a task snapshot with sensible defaults so each test only
// has to specify the fields it cares about.
function buildTask(overrides: TaskOverride = {}): OverdueDecisionInput['task'] {
  return {
    id: 'task-1',
    status: 'assigned',
    scheduledDate: TODAY_KEY,
    scheduledUntilDate: null,
    assignedTo: 'teammate-1',
    overdueTier: 0,
    lastOverdueActionAt: null,
    ...overrides,
  };
}

function decide(
  override: {
    task?: TaskOverride;
    teamOverduePressureEnabled?: boolean;
    today?: Date;
  } = {},
) {
  const { task: taskOverride, ...rest } = override;
  return decideOverdueAction({
    task: buildTask(taskOverride),
    teamOverduePressureEnabled: true,
    today: TODAY,
    ...rest,
  });
}

describe('daysOverdue', () => {
  it('returns 0 when scheduled end equals today', () => {
    expect(daysOverdue(TODAY_KEY, TODAY)).toBe(0);
  });

  it('returns positive integer for past dates', () => {
    expect(daysOverdue('2026-05-12', TODAY)).toBe(7); // 1 week ago
    expect(daysOverdue('2026-05-18', TODAY)).toBe(1);
  });

  it('returns negative integer for future dates', () => {
    expect(daysOverdue('2026-05-20', TODAY)).toBe(-1);
    expect(daysOverdue('2026-06-19', TODAY)).toBe(-31);
  });

  it('is anchored at UTC midnight (no partial-day bleed)', () => {
    // Even at 23:59 local time, today's date key still maps to overdue=0.
    const lateClock = new Date('2026-05-19T23:59:59.999Z');
    expect(daysOverdue(TODAY_KEY, lateClock)).toBe(0);
    // Yesterday is still exactly 1 day overdue at any time on today's clock.
    expect(daysOverdue('2026-05-18', lateClock)).toBe(1);
  });
});

describe('ACTIVE_OVERDUE_STATUSES', () => {
  it('contains exactly the four active task statuses', () => {
    expect([...ACTIVE_OVERDUE_STATUSES]).toEqual([
      'assigned',
      'accepted',
      'in_progress',
      'awaiting_review',
    ]);
  });
});

describe('decideOverdueAction — short-circuit gates', () => {
  it('returns none when task is unassigned', () => {
    expect(
      decide({ task: { assignedTo: null, scheduledDate: '2026-05-10' } }),
    ).toEqual({ kind: 'none' });
  });

  it.each(['completed', 'declined', 'failed', 'cancelled', 'unassigned'] as const)(
    'returns none for terminal/unassigned status: %s',
    (status) => {
      expect(
        decide({ task: { status, scheduledDate: '2026-05-10' } }),
      ).toEqual({ kind: 'none' });
    },
  );

  it('returns none when scheduledDate is null (legacy backfill territory)', () => {
    expect(decide({ task: { scheduledDate: null } })).toEqual({ kind: 'none' });
  });

  it('returns none when team feature flag is off, even if 7 days overdue', () => {
    expect(
      decide({
        task: { scheduledDate: '2026-05-12' },
        teamOverduePressureEnabled: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('returns none when due today (overdue=0)', () => {
    expect(decide({ task: { scheduledDate: TODAY_KEY } })).toEqual({
      kind: 'none',
    });
  });

  it('returns none when scheduled in the future', () => {
    expect(decide({ task: { scheduledDate: '2026-05-25' } })).toEqual({
      kind: 'none',
    });
  });
});

describe('decideOverdueAction — tier bands (no prior action)', () => {
  it('1 day overdue, tier 0 → nudge_teammate (tier 1)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-18', overdueTier: 0 } }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('2 days overdue, tier 0 → nudge_teammate (tier 1)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-17', overdueTier: 0 } }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('3 days overdue, tier 0 → nudge_teammate (no-skip: cap at tier 1)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-16', overdueTier: 0 } }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('3 days overdue, tier 1 → escalate_to_owner (tier 2)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-16', overdueTier: 1 } }),
    ).toEqual({ kind: 'escalate_to_owner', tier: 2 });
  });

  it('5 days overdue, tier 1 → escalate_to_owner (tier 2)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-14', overdueTier: 1 } }),
    ).toEqual({ kind: 'escalate_to_owner', tier: 2 });
  });

  it('7 days overdue, tier 0 → nudge_teammate (no-skip: cap at tier 1, not tier 3)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-12', overdueTier: 0 } }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('7 days overdue, tier 1 → escalate_to_owner (no-skip: cap at tier 2, not tier 3)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-12', overdueTier: 1 } }),
    ).toEqual({ kind: 'escalate_to_owner', tier: 2 });
  });

  it('7 days overdue, tier 2 → auto_reschedule (tier 3)', () => {
    expect(
      decide({ task: { scheduledDate: '2026-05-12', overdueTier: 2 } }),
    ).toEqual({ kind: 'auto_reschedule', tier: 3 });
  });

  it('30 days overdue, tier 2 → auto_reschedule (tier 3) — band stays at 3 for any 7+', () => {
    expect(
      decide({ task: { scheduledDate: '2026-04-19', overdueTier: 2 } }),
    ).toEqual({ kind: 'auto_reschedule', tier: 3 });
  });
});

describe('decideOverdueAction — cool-down', () => {
  it('returns none when last action was 1h ago (within 24h cool-down)', () => {
    const oneHourAgo = new Date(TODAY.getTime() - 60 * 60 * 1000).toISOString();
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-18', // 1 day overdue
          overdueTier: 0,
          lastOverdueActionAt: oneHourAgo,
        },
      }),
    ).toEqual({ kind: 'none' });
  });

  it('returns none when last action was 23h59m ago (just under 24h)', () => {
    const justUnder24h = new Date(
      TODAY.getTime() - (24 * 60 * 60 * 1000 - 60_000),
    ).toISOString();
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-18',
          overdueTier: 0,
          lastOverdueActionAt: justUnder24h,
        },
      }),
    ).toEqual({ kind: 'none' });
  });

  it('fires the next action when last action was 25h ago (cool-down expired)', () => {
    const twentyFiveHoursAgo = new Date(
      TODAY.getTime() - 25 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-18',
          overdueTier: 0,
          lastOverdueActionAt: twentyFiveHoursAgo,
        },
      }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('ignores malformed lastOverdueActionAt timestamps (fail-open: don\'t block forever)', () => {
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-18',
          overdueTier: 0,
          lastOverdueActionAt: 'not-a-real-timestamp',
        },
      }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });
});

describe('decideOverdueAction — multi-day tasks', () => {
  it('measures overdue from scheduledUntilDate when set, not scheduledDate', () => {
    // Task: starts 2026-05-10, ends 2026-05-18 → 1 day overdue, not 9.
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-10',
          scheduledUntilDate: '2026-05-18',
          overdueTier: 0,
        },
      }),
    ).toEqual({ kind: 'nudge_teammate', tier: 1 });
  });

  it('a multi-day task ending today is NOT overdue (even if it started 10 days ago)', () => {
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-09',
          scheduledUntilDate: TODAY_KEY,
          overdueTier: 0,
        },
      }),
    ).toEqual({ kind: 'none' });
  });

  it('a multi-day task ending in the future is NOT overdue', () => {
    expect(
      decide({
        task: {
          scheduledDate: '2026-05-09',
          scheduledUntilDate: '2026-05-30',
          overdueTier: 0,
        },
      }),
    ).toEqual({ kind: 'none' });
  });
});

describe('decideOverdueAction — active status coverage', () => {
  it.each(['assigned', 'accepted', 'in_progress', 'awaiting_review'] as const)(
    'fires for active status %s when overdue',
    (status) => {
      expect(
        decide({
          task: { status, scheduledDate: '2026-05-18', overdueTier: 0 },
        }),
      ).toEqual({ kind: 'nudge_teammate', tier: 1 });
    },
  );
});

describe('isOverdue (UI helper)', () => {
  // Use a minimal AgentTask-shaped fixture: isOverdue only reads four
  // fields, so we cast through a literal-shape rather than building a full
  // AgentTask each time.
  function partialTask(overrides: Partial<AgentTask> = {}): AgentTask {
    return {
      status: 'assigned',
      scheduledDate: '2026-05-18',
      scheduledUntilDate: null,
      assignedTo: 'teammate-1',
      ...overrides,
    } as AgentTask;
  }

  it('returns true when overdue, active, assigned, and has a scheduled date', () => {
    expect(isOverdue(partialTask(), TODAY)).toBe(true);
  });

  it('returns false when scheduled in the future', () => {
    expect(
      isOverdue(partialTask({ scheduledDate: '2026-05-25' }), TODAY),
    ).toBe(false);
  });

  it('returns false when unassigned', () => {
    expect(isOverdue(partialTask({ assignedTo: null }), TODAY)).toBe(false);
  });

  it('returns false on terminal status', () => {
    expect(isOverdue(partialTask({ status: 'completed' }), TODAY)).toBe(false);
  });

  it('returns false when scheduledDate is null', () => {
    expect(isOverdue(partialTask({ scheduledDate: null }), TODAY)).toBe(false);
  });

  it('uses scheduledUntilDate for multi-day tasks', () => {
    expect(
      isOverdue(
        partialTask({
          scheduledDate: '2026-05-01',
          scheduledUntilDate: '2026-05-30', // ends in the future
        }),
        TODAY,
      ),
    ).toBe(false);
  });
});
