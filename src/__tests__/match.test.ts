// Phase 3 / Plan 06 — match.ts pure helpers for Recgon's refusal + deferral
// decision tree.
//
// `hasMinimumFit(breakdown)` is the FIT-signal floor — TRUE iff at least
// one of {skillOverlap, fitForKind, interestNudge} >= SIGNAL_FLOOR (0.15).
// Availability + load are NOT fit signals: they're tiebreakers, never sole
// reasons to assign (user rule 2026-05-15: "the recgon should NEVER EVER
// assign a task to someone because nobody else had time").
//
// `findEarliestCapacityWindow(qualified, task, opts?)` scans week-by-week
// from now through DEFER_LOOKAHEAD_WEEKS (4) and returns Monday of the
// earliest week where at least one qualified candidate's projected
// availabilityNow >= DEFER_FLOOR (0.3). Null if no window opens — Pass 3
// triages with `no_capacity_in_window` in that case.

import { describe, it, expect } from 'vitest';
import {
  hasMinimumFit,
  findEarliestCapacityWindow,
  SIGNAL_FLOOR,
  DEFER_FLOOR,
  DEFER_LOOKAHEAD_WEEKS,
  HIGH_PRIORITY_THRESHOLD,
  type MatchResult,
  type Scoreable,
} from '../lib/recgon/match';
import type { AgentTask, Teammate } from '../lib/recgon/types';

// ── Fixture helpers ─────────────────────────────────────────────────────────

function mkTeammate(overrides: Partial<Teammate> = {}): Scoreable {
  return {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    userId: 'u-1',
    displayName: 'Tm',
    avatarColor: null,
    avatarUrl: null,
    title: null,
    skills: [],
    capacityHours: 40,
    workingHours: null,
    fitProfile: {},
    status: 'active',
    createdAt: '2026-01-01',
    ...overrides,
  } as Scoreable;
}

function mkBreakdown(
  overrides: Partial<MatchResult['breakdown']> = {},
): MatchResult['breakdown'] {
  return {
    skillOverlap: 0,
    fitForKind: 0,
    availabilityNow: 0,
    loadHeadroom: 0,
    interestNudge: 0,
    ...overrides,
  };
}

function mkMatch(
  id: string,
  breakdown: Partial<MatchResult['breakdown']> = {},
  score = 0.5,
): MatchResult {
  return {
    teammate: mkTeammate({ id }),
    score,
    breakdown: mkBreakdown(breakdown),
  };
}

function mkTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 't',
    projectId: null,
    title: 'Test task',
    description: '',
    kind: 'dev_prompt',
    source: 'brain',
    sourceRef: {},
    requiredSkills: ['react'],
    priority: 1,
    estimatedHours: 2,
    deadline: null,
    assignedTo: null,
    assignedBy: null,
    assignedAt: null,
    status: 'unassigned',
    jobId: null,
    result: null,
    createdBy: null,
    createdAt: '2026-05-14',
    completedAt: null,
    proof: null,
    verificationStatus: 'none',
    verificationEvidence: null,
    verifiedAt: null,
    verifiedBy: null,
    scheduledDate: null,
    scheduledUntilDate: null,
    scheduleNote: null,
    rescheduleRequestStatus: 'none',
    rescheduleRequestedAt: null,
    rescheduleRequestedBy: null,
    rescheduleRequestNote: null,
    rescheduleRequestedDate: null,
    ...overrides,
  };
}

// ── hasMinimumFit ───────────────────────────────────────────────────────────

describe('hasMinimumFit — FIT-signal floor (user rule: never assign by availability alone)', () => {
  it('exports SIGNAL_FLOOR=0.15, DEFER_FLOOR=0.3, DEFER_LOOKAHEAD_WEEKS=4, HIGH_PRIORITY_THRESHOLD=3', () => {
    expect(SIGNAL_FLOOR).toBe(0.15);
    expect(DEFER_FLOOR).toBe(0.3);
    expect(DEFER_LOOKAHEAD_WEEKS).toBe(4);
    expect(HIGH_PRIORITY_THRESHOLD).toBe(3);
  });

  it('all-zero breakdown → false', () => {
    expect(hasMinimumFit(mkBreakdown())).toBe(false);
  });

  it('skillOverlap=0.15 exactly → true (boundary inclusive)', () => {
    expect(hasMinimumFit(mkBreakdown({ skillOverlap: 0.15 }))).toBe(true);
  });

  it('skillOverlap=0.14 → false (just under boundary)', () => {
    expect(hasMinimumFit(mkBreakdown({ skillOverlap: 0.14 }))).toBe(false);
  });

  it('fitForKind=0.20 → true', () => {
    expect(hasMinimumFit(mkBreakdown({ fitForKind: 0.20 }))).toBe(true);
  });

  it('interestNudge=0.16 → true', () => {
    expect(hasMinimumFit(mkBreakdown({ interestNudge: 0.16 }))).toBe(true);
  });

  // CRITICAL — locks user rule 2026-05-15.
  it('availabilityNow=1.0 + loadHeadroom=1.0 alone (zero fit signals) → FALSE', () => {
    expect(
      hasMinimumFit(
        mkBreakdown({
          skillOverlap: 0,
          fitForKind: 0,
          interestNudge: 0,
          availabilityNow: 1.0,
          loadHeadroom: 1.0,
        }),
      ),
    ).toBe(false);
  });

  it('any one FIT signal above floor is enough — others zero', () => {
    expect(hasMinimumFit(mkBreakdown({ skillOverlap: 0.5 }))).toBe(true);
    expect(hasMinimumFit(mkBreakdown({ fitForKind: 0.5 }))).toBe(true);
    expect(hasMinimumFit(mkBreakdown({ interestNudge: 0.5 }))).toBe(true);
  });
});

// ── findEarliestCapacityWindow ──────────────────────────────────────────────

describe('findEarliestCapacityWindow — week-by-week scan for next deferral target', () => {
  // Use a fixed `now` so week math is deterministic regardless of when the
  // test runs. 2026-05-18 is a Monday — easy to reason about.
  const FIXED_NOW = new Date('2026-05-18T10:00:00Z');
  const MONDAY_W0 = '2026-05-18'; // current week
  const MONDAY_W1 = '2026-05-25';
  const MONDAY_W2 = '2026-06-01';
  const MONDAY_W3 = '2026-06-08';

  it('empty qualified[] → null', () => {
    const out = findEarliestCapacityWindow([], mkTask(), { now: FIXED_NOW });
    expect(out).toBe(null);
  });

  it('one qualified candidate with availabilityNow=0.5 NOW → returns Monday of current week', () => {
    const qualified = [mkMatch('tm-1', { skillOverlap: 0.5, availabilityNow: 0.5 })];
    const out = findEarliestCapacityWindow(qualified, mkTask(), {
      now: FIXED_NOW,
      projectionFn: (_id, weekOffset) => (weekOffset === 0 ? 0.5 : 0.5),
    });
    expect(out).not.toBeNull();
    expect(out!.toISOString().slice(0, 10)).toBe(MONDAY_W0);
  });

  it('one qualified booked NOW (0.1) but projected 0.6 in week 2 → returns Monday of week 2', () => {
    const qualified = [mkMatch('tm-1', { skillOverlap: 0.5, availabilityNow: 0.1 })];
    const projectionFn = (_id: string, weekOffset: number): number => {
      if (weekOffset === 0) return 0.1;
      if (weekOffset === 1) return 0.2; // still booked
      if (weekOffset === 2) return 0.6; // capacity opens
      return 0.6;
    };
    const out = findEarliestCapacityWindow(qualified, mkTask(), {
      now: FIXED_NOW,
      projectionFn,
    });
    expect(out).not.toBeNull();
    expect(out!.toISOString().slice(0, 10)).toBe(MONDAY_W2);
  });

  it('all qualified booked (< 0.3) for full lookahead → null', () => {
    const qualified = [
      mkMatch('tm-1', { skillOverlap: 0.5, availabilityNow: 0.1 }),
      mkMatch('tm-2', { skillOverlap: 0.4, availabilityNow: 0.15 }),
    ];
    const out = findEarliestCapacityWindow(qualified, mkTask(), {
      now: FIXED_NOW,
      projectionFn: () => 0.1,
    });
    expect(out).toBe(null);
  });

  it('candidate hits 0.3 exactly in week 3 (boundary inclusive) → returns Monday of week 3', () => {
    const qualified = [mkMatch('tm-1', { skillOverlap: 0.5, availabilityNow: 0.1 })];
    const projectionFn = (_id: string, weekOffset: number): number => {
      if (weekOffset < 3) return 0.1;
      return 0.3; // exactly at floor
    };
    const out = findEarliestCapacityWindow(qualified, mkTask(), {
      now: FIXED_NOW,
      projectionFn,
    });
    expect(out).not.toBeNull();
    expect(out!.toISOString().slice(0, 10)).toBe(MONDAY_W3);
  });

  it('earliest week wins when multiple qualified open at different weeks', () => {
    const qualified = [
      mkMatch('tm-late', { skillOverlap: 0.5, availabilityNow: 0.1 }),
      mkMatch('tm-early', { skillOverlap: 0.4, availabilityNow: 0.1 }),
    ];
    const projectionFn = (id: string, weekOffset: number): number => {
      if (id === 'tm-early' && weekOffset >= 1) return 0.5;
      if (id === 'tm-late' && weekOffset >= 3) return 0.5;
      return 0.1;
    };
    const out = findEarliestCapacityWindow(qualified, mkTask(), {
      now: FIXED_NOW,
      projectionFn,
    });
    expect(out).not.toBeNull();
    expect(out!.toISOString().slice(0, 10)).toBe(MONDAY_W1);
  });
});
