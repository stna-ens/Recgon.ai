// Phase 3 / Plan 06 — dispatcher 4-outcome decision tree.
//
// The dispatcher must implement four outcomes in Pass 3:
//   1. Assign: at least one candidate has FIT signal (hasMinimumFit) AND
//      capacity NOW (availabilityNow >= DEFER_FLOOR) AND Plan 03-05's
//      whyYouSentence is non-null.
//   2. Triage 'no_clear_fit': no candidate has any FIT signal — task stays
//      unassigned with triage_note='no_clear_fit'. Availability alone NEVER
//      qualifies a candidate (user rule 2026-05-15).
//   3. Defer: qualified candidates exist but all are booked NOW; task's
//      scheduledDate moves to the earliest week (within 4) where capacity
//      opens. Task stays unassigned with triage_note=null.
//   4. Triage 'no_capacity_in_window': qualified candidates exist but none
//      has capacity within the 4-week lookahead.
//   4'. Triage 'no_capacity_high_priority': qualified-but-booked-NOW path
//       for priority>=3 tasks — bypasses deferral, owner triages immediately.
//
//   Coupling with Plan 03-05: if assignment would proceed but the grounded
//   Why-you LLM returns null, the dispatcher refuses with
//   triage_note='no_grounded_reason'.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks (must be defined before importing dispatcher) ────────────────────

vi.mock('@/lib/recgon/storage', () => ({
  listTeammatesWithStats: vi.fn(),
  listTasks: vi.fn().mockResolvedValue([]),
  listUnassignedTasks: vi.fn(),
  assignTask: vi.fn().mockResolvedValue(undefined),
  setTaskSchedule: vi.fn().mockResolvedValue(undefined),
  loadHoursByDateForTeammate: vi.fn().mockResolvedValue({}),
  loadHoursByDateForUser: vi.fn().mockResolvedValue({}),
  appendAssignmentLog: vi.fn().mockResolvedValue(undefined),
  saveBrainSnapshot: vi.fn().mockResolvedValue(undefined),
  logEvent: vi.fn().mockResolvedValue(undefined),
  getTask: vi.fn(),
  getTeammate: vi.fn().mockResolvedValue(null),
  updateTaskRequiredSkills: vi.fn().mockResolvedValue(undefined),
  // Plan 06 new helpers
  markTaskForTriage: vi.fn().mockResolvedValue(undefined),
  deferTaskScheduledDate: vi.fn().mockResolvedValue(undefined),
  clearTriageNote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/recgon/profileStorage', () => ({
  listProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  listActiveInferredSkillsForTeam: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/recgon/brain', () => ({
  readUnifiedBrain: vi.fn().mockResolvedValue({
    computedAt: '2026-05-14T00:00:00Z',
    totalEntries: 0,
    byKind: {},
    entries: [],
  }),
}));

vi.mock('@/lib/recgon/taskMint', () => ({
  mintTasksFromBrain: vi.fn().mockResolvedValue({ minted: [], skipped: 0 }),
}));

vi.mock('@/lib/recgon/scheduler', () => ({
  planTaskSchedule: vi.fn().mockReturnValue({
    scheduledDate: '2026-05-18',
    deadline: '2026-05-19',
    scheduleNote: 'ok',
  }),
  scheduleTimelinessScore: vi.fn().mockReturnValue(0.5),
}));

vi.mock('@/lib/recgon/skillTagger', () => ({
  tagSingleTaskWithSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/notifications', () => ({
  notifyTeammateAssigned: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Team' } }) }) }),
    }),
  },
}));

vi.mock('@/lib/recgon/match', async () => {
  const actual = await vi.importActual<typeof import('@/lib/recgon/match')>(
    '@/lib/recgon/match',
  );
  return {
    ...actual,
    rankMatches: vi.fn(),
    findEarliestCapacityWindow: vi.fn(),
  };
});

vi.mock('@/lib/llm/providers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm/providers')>(
    '@/lib/llm/providers',
  );
  return {
    ...actual,
    chatViaProviders: vi.fn(),
  };
});

vi.mock('@/lib/recgon/judgmentBudget', () => ({
  checkAndIncrement: vi.fn().mockResolvedValue({ allowed: true, callsToday: 1 }),
  alertCapExceededOnce: vi.fn().mockResolvedValue(undefined),
  currentUsageDate: () => '2026-05-14',
  DAILY_JUDGMENT_CALL_CAP: 50,
}));

// Default: Why-you returns a grounded sentence. Tests can override per-case
// to return null and exercise the no_grounded_reason refusal path.
vi.mock('@/lib/recgon/whyYouLLM', () => ({
  generateWhyYouSentence: vi.fn().mockResolvedValue({
    sentence: 'You have the matching skills for this work.',
    citedSignal: 'declared_skill_match',
  }),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { runDispatch, dispatchTask } from '@/lib/recgon/dispatcher';
import {
  listTeammatesWithStats,
  listUnassignedTasks,
  assignTask,
  getTask,
  markTaskForTriage,
  deferTaskScheduledDate,
  clearTriageNote,
} from '@/lib/recgon/storage';
import { rankMatches, findEarliestCapacityWindow } from '@/lib/recgon/match';
import { generateWhyYouSentence } from '@/lib/recgon/whyYouLLM';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import type { MatchResult } from '@/lib/recgon/match';

// ── Fixture helpers ─────────────────────────────────────────────────────────

function teammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: 'tm-x',
    teamId: 't',
    userId: 'u-x',
    displayName: 'Teammate X',
    skills: [],
    fitProfile: { taskKindScores: {}, skillStats: {} },
    capacityHours: 40,
    workingHours: null,
    status: 'active',
    createdAt: '2026-01-01',
    title: null,
    avatarColor: null,
    avatarUrl: null,
    stars: 0,
    ratingCount: 0,
    upCount: 0,
    downCount: 0,
    inFlightCount: 0,
    inFlightHours: 0,
    teamRole: 'member',
    ...overrides,
  };
}

function makeTask(id: string, overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id,
    teamId: 't',
    projectId: null,
    title: `Task ${id}`,
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

function mkMatch(
  tm: TeammateWithStats,
  breakdown: Partial<MatchResult['breakdown']> = {},
  score = 0.5,
): MatchResult {
  return {
    teammate: tm,
    score,
    breakdown: {
      skillOverlap: 0,
      fitForKind: 0,
      availabilityNow: 0,
      loadHeadroom: 0,
      interestNudge: 0,
      ...breakdown,
    },
  };
}

const mockedListTeammates = listTeammatesWithStats as unknown as ReturnType<typeof vi.fn>;
const mockedListUnassigned = listUnassignedTasks as unknown as ReturnType<typeof vi.fn>;
const mockedRankMatches = rankMatches as unknown as ReturnType<typeof vi.fn>;
const mockedAssignTask = assignTask as unknown as ReturnType<typeof vi.fn>;
const mockedMarkForTriage = markTaskForTriage as unknown as ReturnType<typeof vi.fn>;
const mockedDefer = deferTaskScheduledDate as unknown as ReturnType<typeof vi.fn>;
const mockedClearTriage = clearTriageNote as unknown as ReturnType<typeof vi.fn>;
const mockedFindEarliestCapacityWindow = findEarliestCapacityWindow as unknown as ReturnType<
  typeof vi.fn
>;
const mockedWhyYou = generateWhyYouSentence as unknown as ReturnType<typeof vi.fn>;
const mockedGetTask = getTask as unknown as ReturnType<typeof vi.fn>;

// Three teammates the suite reuses across scenarios.
const tmA = teammate({ id: 'tm-a', userId: 'u-a', displayName: 'A', skills: ['react'] });
const tmB = teammate({ id: 'tm-b', userId: 'u-b', displayName: 'B' });
const tmC = teammate({ id: 'tm-c', userId: 'u-c', displayName: 'C' });

beforeEach(() => {
  mockedListTeammates.mockReset();
  mockedListUnassigned.mockReset();
  mockedRankMatches.mockReset();
  mockedAssignTask.mockReset();
  mockedAssignTask.mockResolvedValue(undefined);
  mockedMarkForTriage.mockReset();
  mockedMarkForTriage.mockResolvedValue(undefined);
  mockedDefer.mockReset();
  mockedDefer.mockResolvedValue(undefined);
  mockedClearTriage.mockReset();
  mockedClearTriage.mockResolvedValue(undefined);
  mockedFindEarliestCapacityWindow.mockReset();
  mockedWhyYou.mockReset();
  mockedWhyYou.mockResolvedValue({
    sentence: 'You have the matching skills for this work.',
    citedSignal: 'declared_skill_match',
  });
  mockedGetTask.mockReset();
});

// ── Outcome 1: Assign (happy path) ─────────────────────────────────────────

describe('Outcome 1 — assign when qualified candidate has FIT + capacity + grounded sentence', () => {
  it('one teammate with skillOverlap=0.4 + availabilityNow=0.8 → assigned, no triage, no defer', async () => {
    mockedListTeammates.mockResolvedValue([tmA, tmB]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-1')]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.4, availabilityNow: 0.8 }, 0.55),
      mkMatch(tmB, {}, 0.0),
    ]);

    const result = await runDispatch('t');

    expect(mockedAssignTask).toHaveBeenCalledTimes(1);
    expect(mockedAssignTask.mock.calls[0][1]).toBe(tmA.id);
    expect(mockedMarkForTriage).not.toHaveBeenCalled();
    expect(mockedDefer).not.toHaveBeenCalled();
    expect(result.triaged).toBe(0);
    expect(result.deferred).toBe(0);
    expect(result.assigned).toBe(1);
  });
});

// ── Outcome 2: Triage — no_clear_fit ───────────────────────────────────────

describe('Outcome 2 — triage `no_clear_fit` when no candidate has any FIT signal', () => {
  it('three teammates all fail hasMinimumFit → triage_note=no_clear_fit, no assignment', async () => {
    mockedListTeammates.mockResolvedValue([tmA, tmB, tmC]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-1')]);
    // None of them clears SIGNAL_FLOOR=0.15 on any FIT signal.
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { availabilityNow: 0.9 }, 0.1),
      mkMatch(tmB, { availabilityNow: 0.5 }, 0.05),
      mkMatch(tmC, { availabilityNow: 0.0 }, 0.0),
    ]);

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-1', 'no_clear_fit');
    expect(result.triaged).toBe(1);
    expect(result.deferred).toBe(0);
    expect(result.assigned).toBe(0);
  });

  // CRITICAL — user rule 2026-05-15.
  it('candidate with availabilityNow=1.0 + zero FIT signals → still triage no_clear_fit (locks user rule)', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-1')]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(
        tmA,
        {
          skillOverlap: 0,
          fitForKind: 0,
          interestNudge: 0,
          availabilityNow: 1.0,
          loadHeadroom: 1.0,
        },
        0.25,
      ),
    ]);

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-1', 'no_clear_fit');
    expect(result.triaged).toBe(1);
  });

  it('empty ranked[] (no eligible candidates at all) → triage no_clear_fit', async () => {
    mockedListTeammates.mockResolvedValue([tmA, tmB]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-1')]);
    mockedRankMatches.mockReturnValueOnce([]);

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-1', 'no_clear_fit');
    expect(result.triaged).toBe(1);
  });
});

// ── Outcome 3: Defer ──────────────────────────────────────────────────────

describe('Outcome 3 — defer when qualified candidates exist but all booked NOW (priority < 3)', () => {
  it('one qualified candidate booked NOW (0.1) + capacity in week 2 → scheduledDate moves, no assignment', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-defer-1', { priority: 1 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);
    const futureMonday = new Date('2026-06-01T00:00:00Z');
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(futureMonday);

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedDefer).toHaveBeenCalledTimes(1);
    expect(mockedDefer.mock.calls[0][0]).toBe('task-defer-1');
    expect(mockedDefer.mock.calls[0][1]).toEqual(futureMonday);
    expect(mockedMarkForTriage).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    expect(result.triaged).toBe(0);
    expect(result.assigned).toBe(0);
  });

  it('all qualified candidates booked NOW + week-1 window open → deferred to week 1 (earliest)', async () => {
    mockedListTeammates.mockResolvedValue([tmA, tmB]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-defer-2', { priority: 0 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
      mkMatch(tmB, { skillOverlap: 0.3, availabilityNow: 0.2 }, 0.35),
    ]);
    const week1Monday = new Date('2026-05-25T00:00:00Z');
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(week1Monday);

    const result = await runDispatch('t');

    expect(mockedDefer).toHaveBeenCalledTimes(1);
    expect(mockedDefer.mock.calls[0][1]).toEqual(week1Monday);
    expect(result.deferred).toBe(1);
  });
});

// ── Outcome 4: Triage — no_capacity_in_window ──────────────────────────────

describe('Outcome 4 — triage no_capacity_in_window when qualified candidates have no opening', () => {
  it('qualified candidate booked across full 4-week lookahead → triage no_capacity_in_window', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-stuck', { priority: 1 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(null);

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedDefer).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-stuck', 'no_capacity_in_window');
    expect(result.triaged).toBe(1);
    expect(result.deferred).toBe(0);
  });
});

// ── Outcome 4': Triage — no_capacity_high_priority ─────────────────────────

describe("Outcome 4' — high-priority bypass: priority>=3 skips deferral", () => {
  it('priority=3 task with qualified-but-booked candidate → triage no_capacity_high_priority (no defer)', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-hi-3', { priority: 3 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);
    // Even if a future window WERE available, high-priority must bypass.
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(new Date('2026-06-01T00:00:00Z'));

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedDefer).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith(
      'task-hi-3',
      'no_capacity_high_priority',
    );
    expect(result.triaged).toBe(1);
    expect(result.deferred).toBe(0);
  });

  it('priority=4 task (above threshold) → same bypass', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-hi-4', { priority: 4 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);

    const result = await runDispatch('t');

    expect(mockedMarkForTriage).toHaveBeenCalledWith(
      'task-hi-4',
      'no_capacity_high_priority',
    );
    expect(result.triaged).toBe(1);
  });

  it('priority=2 task (below threshold) → goes through deferral path normally', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-lo-2', { priority: 2 })]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);
    const futureMonday = new Date('2026-06-01T00:00:00Z');
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(futureMonday);

    const result = await runDispatch('t');

    expect(mockedDefer).toHaveBeenCalledTimes(1);
    expect(mockedMarkForTriage).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
  });
});

// ── Coupling with Plan 03-05: no_grounded_reason ──────────────────────────

describe('Coupling with Plan 03-05: whyYouSentence=null → triage no_grounded_reason', () => {
  it('qualified candidate with capacity but Why-you returns null → refuses assignment', async () => {
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([makeTask('task-ungrounded')]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.8 }, 0.55),
    ]);
    mockedWhyYou.mockResolvedValueOnce({ sentence: null, citedSignal: null });

    const result = await runDispatch('t');

    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-ungrounded', 'no_grounded_reason');
    expect(result.triaged).toBe(1);
    expect(result.assigned).toBe(0);
  });
});

// ── Successful assignment clears prior triage ─────────────────────────────

describe('clearTriageNote on successful assignment (cron retry path)', () => {
  it('previously-triaged task that now has a fit + capacity → clearTriageNote called', async () => {
    const task = makeTask('task-retry');
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([task]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.8 }, 0.55),
    ]);

    await runDispatch('t');

    expect(mockedAssignTask).toHaveBeenCalledTimes(1);
    expect(mockedClearTriage).toHaveBeenCalledWith('task-retry');
  });
});

// ── Single-task path: dispatchTask honors the same decision tree ──────────

describe('dispatchTask (single-task entry) honors the same 4-outcome tree', () => {
  it('no_clear_fit via dispatchTask → markTaskForTriage called', async () => {
    const task = makeTask('task-st-1');
    mockedGetTask.mockResolvedValue(task);
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { availabilityNow: 1.0 }, 0.25),
    ]);

    const result = await dispatchTask('t', 'task-st-1');

    expect(result).toBe('triage');
    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedMarkForTriage).toHaveBeenCalledWith('task-st-1', 'no_clear_fit');
  });

  it('defer via dispatchTask → deferTaskScheduledDate called', async () => {
    const task = makeTask('task-st-2', { priority: 1 });
    mockedGetTask.mockResolvedValue(task);
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);
    const futureMonday = new Date('2026-06-01T00:00:00Z');
    mockedFindEarliestCapacityWindow.mockReturnValueOnce(futureMonday);

    const result = await dispatchTask('t', 'task-st-2');

    expect(result).toBe('deferred');
    expect(mockedAssignTask).not.toHaveBeenCalled();
    expect(mockedDefer).toHaveBeenCalledWith('task-st-2', futureMonday);
  });

  it('high-priority bypass via dispatchTask → triage no_capacity_high_priority', async () => {
    const task = makeTask('task-st-3', { priority: 3 });
    mockedGetTask.mockResolvedValue(task);
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { skillOverlap: 0.5, availabilityNow: 0.1 }, 0.4),
    ]);

    const result = await dispatchTask('t', 'task-st-3');

    expect(result).toBe('triage');
    expect(mockedMarkForTriage).toHaveBeenCalledWith(
      'task-st-3',
      'no_capacity_high_priority',
    );
  });
});

// ── Idempotency: cron retry on already-triaged task ───────────────────────

describe('idempotency — cron retry on already-triaged task', () => {
  it('same conditions → markTaskForTriage called again with same note (idempotent write)', async () => {
    const task = makeTask('task-stuck');
    mockedListTeammates.mockResolvedValue([tmA]);
    mockedListUnassigned.mockResolvedValue([task]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { availabilityNow: 1.0 }, 0.25),
    ]);

    await runDispatch('t');
    expect(mockedMarkForTriage).toHaveBeenCalledTimes(1);
    expect(mockedMarkForTriage).toHaveBeenLastCalledWith('task-stuck', 'no_clear_fit');

    mockedMarkForTriage.mockClear();
    mockedListUnassigned.mockResolvedValueOnce([task]);
    mockedRankMatches.mockReturnValueOnce([
      mkMatch(tmA, { availabilityNow: 1.0 }, 0.25),
    ]);

    await runDispatch('t');
    expect(mockedMarkForTriage).toHaveBeenCalledTimes(1);
    expect(mockedMarkForTriage).toHaveBeenLastCalledWith('task-stuck', 'no_clear_fit');
  });
});
