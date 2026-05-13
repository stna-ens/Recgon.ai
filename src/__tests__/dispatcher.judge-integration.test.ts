// Phase 3 Plan 02 — dispatcher.judge-integration.test.ts (RED scaffold).
//
// Proves the 3-pass restructure (rank-all → batch-judge close-calls → assign):
//   - 4-task backlog where tasks A, B have close gaps (< 0.20) and tasks C, D have wide gaps
//   - Stubbed `chatViaProviders` returns valid JudgeResult with picks for A and B only
//   - Exactly ONE batched LLM call covers all close-calls (JUDGE-06)
//   - A, B assigned per judge picks; C, D per math top-1 (JUDGE-01, JUDGE-02)
//   - In-process cache holds entries for close-call tasks (JUDGE-09)
//   - checkAndIncrement called once for the batch (JUDGE-10)
//   - Cap-exhausted variant: chat never called; math fallback for all; alertCapExceededOnce fires once

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Module mocks (mirror dispatcherProfileMerge.test.ts shape) ─────────────

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
    scheduledDate: '2026-05-15',
    deadline: '2026-05-16',
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

// Match.rankMatches is the real implementation — but we stub it per-test to
// return deterministic close-call vs. clear-winner shapes (the math layer is
// already covered by `recgonMatch.test.ts`; what we're testing here is the
// dispatcher's three-pass orchestration on top of those rankings).
vi.mock('@/lib/recgon/match', async () => {
  const actual = await vi.importActual<typeof import('@/lib/recgon/match')>(
    '@/lib/recgon/match',
  );
  return {
    ...actual,
    rankMatches: vi.fn(),
  };
});

// chatViaProviders — the adapter the dispatcher passes into runJudgment.
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
  checkAndIncrement: vi.fn(),
  alertCapExceededOnce: vi.fn().mockResolvedValue(undefined),
  currentUsageDate: () => '2026-05-14',
  DAILY_JUDGMENT_CALL_CAP: 50,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { runDispatch } from '@/lib/recgon/dispatcher';
import {
  listTeammatesWithStats,
  listUnassignedTasks,
  assignTask,
} from '@/lib/recgon/storage';
import { rankMatches } from '@/lib/recgon/match';
import { chatViaProviders } from '@/lib/llm/providers';
import {
  checkAndIncrement,
  alertCapExceededOnce,
} from '@/lib/recgon/judgmentBudget';
import type {
  AgentTask,
  TeammateWithStats,
} from '@/lib/recgon/types';
import type { MatchResult } from '@/lib/recgon/match';

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function makeMatch(tm: TeammateWithStats, score: number): MatchResult {
  return {
    teammate: tm,
    score,
    breakdown: {
      skillOverlap: score,
      fitForKind: score,
      availabilityNow: 1,
      loadHeadroom: 1,
      interestNudge: 0,
    },
  };
}

const mockedListTeammates = listTeammatesWithStats as unknown as ReturnType<typeof vi.fn>;
const mockedListUnassigned = listUnassignedTasks as unknown as ReturnType<typeof vi.fn>;
const mockedRankMatches = rankMatches as unknown as ReturnType<typeof vi.fn>;
const mockedChat = chatViaProviders as unknown as ReturnType<typeof vi.fn>;
const mockedAssignTask = assignTask as unknown as ReturnType<typeof vi.fn>;
const mockedCheckAndIncrement = checkAndIncrement as unknown as ReturnType<typeof vi.fn>;
const mockedAlertCap = alertCapExceededOnce as unknown as ReturnType<typeof vi.fn>;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('dispatcher — 3-pass judgment integration (Plan 03-02 / JUDGE-01, 02, 06, 09, 10)', () => {
  const tmA = teammate({ id: 'tm-1', userId: 'u-1', displayName: 'A' });
  const tmB = teammate({ id: 'tm-2', userId: 'u-2', displayName: 'B' });
  const tmC = teammate({ id: 'tm-3', userId: 'u-3', displayName: 'C' });

  beforeEach(() => {
    mockedListTeammates.mockReset();
    mockedListUnassigned.mockReset();
    mockedRankMatches.mockReset();
    mockedChat.mockReset();
    mockedAssignTask.mockReset();
    mockedAssignTask.mockResolvedValue(undefined);
    mockedCheckAndIncrement.mockReset();
    mockedAlertCap.mockReset();
    mockedAlertCap.mockResolvedValue(undefined);
  });

  it('makes EXACTLY ONE batched chat call covering all close-call tasks (JUDGE-06)', async () => {
    const taskA = makeTask('task-a');
    const taskB = makeTask('task-b');
    const taskC = makeTask('task-c');
    const taskD = makeTask('task-d');

    mockedListTeammates.mockResolvedValue([tmA, tmB, tmC]);
    mockedListUnassigned.mockResolvedValue([taskA, taskB, taskC, taskD]);

    // task-a and task-b: close-calls (gap = 0.05 < 0.20)
    // task-c and task-d: clear winners (gap = 0.30 > 0.20)
    mockedRankMatches.mockImplementation((_teammates, input) => {
      if (input.requiredSkills?.[0] === 'react') {
        // task-a, task-b, task-c, task-d all use 'react' so disambiguate via
        // estimatedHours or kind — but simpler: cycle by call order.
        return [];
      }
      return [];
    });

    // We can't disambiguate via requiredSkills alone (all 4 tasks share
    // ['react']), so set per-call return values via sequential mockReturnValue.
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmA, 0.80),  // top-1
      makeMatch(tmB, 0.75),  // top-2 — gap 0.05, CLOSE CALL
      makeMatch(tmC, 0.50),
    ]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmB, 0.78),  // top-1
      makeMatch(tmA, 0.73),  // top-2 — gap 0.05, CLOSE CALL
      makeMatch(tmC, 0.50),
    ]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmA, 0.80),  // top-1
      makeMatch(tmC, 0.50),  // top-2 — gap 0.30, CLEAR WINNER
    ]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmB, 0.85),  // top-1
      makeMatch(tmC, 0.50),  // top-2 — gap 0.35, CLEAR WINNER
    ]);

    mockedCheckAndIncrement.mockResolvedValue({ allowed: true, callsToday: 1 });

    // Judge returns picks for both close-call tasks. Chosen candidate id = 2
    // for task-a (meaning anon_id=2 → tmB at ranked[1]) and id = 1 for task-b
    // (anon_id=1 → tmB at ranked[0]).
    mockedChat.mockResolvedValueOnce(
      JSON.stringify({
        picks: [
          {
            task_id: 'task-a',
            chosen_candidate_id: 2,
            reason_code: 'capacity_headroom',
            reason_sentence: 'your week is the clearest of the candidates.',
            confidence: 'medium',
          },
          {
            task_id: 'task-b',
            chosen_candidate_id: 1,
            reason_code: 'capacity_headroom',
            reason_sentence: 'your week is the clearest of the candidates.',
            confidence: 'medium',
          },
        ],
      }),
    );

    await runDispatch('t');

    // EXACTLY ONE chat call for the batch.
    expect(mockedChat).toHaveBeenCalledTimes(1);

    // checkAndIncrement also called exactly once (one batch = one increment).
    expect(mockedCheckAndIncrement).toHaveBeenCalledTimes(1);

    // assignTask called once per task that got assigned.
    // task-a: judge picked candidate 2 (tmB)
    // task-b: judge picked candidate 1 (tmB)
    // task-c: math top-1 (tmA)
    // task-d: math top-1 (tmB)
    expect(mockedAssignTask).toHaveBeenCalledTimes(4);

    // Verify assignees from the call args.
    const assignCalls = mockedAssignTask.mock.calls.map(
      (call: unknown[]) => ({ taskId: call[0], teammateId: call[1] }),
    );
    const byTask = Object.fromEntries(assignCalls.map((c: { taskId: unknown; teammateId: unknown }) => [c.taskId, c.teammateId]));

    expect(byTask['task-a']).toBe(tmB.id);  // judge override → tmB at index 1
    expect(byTask['task-b']).toBe(tmB.id);  // judge override → tmB at index 0
    expect(byTask['task-c']).toBe(tmA.id);  // math top-1
    expect(byTask['task-d']).toBe(tmB.id);  // math top-1

    // Phase 3 / Plan 03 — every assignTask call now carries the
    // AssignmentReasoning envelope. assignTask signature is:
    //   (taskId, teammateId, assignedBy, jobId, schedule, reasoning)
    // So `reasoning` is arg index 5. Judge-picked tasks get
    // `kind: 'llm_tiebreaker'`, math top-1 tasks get `kind: 'math_only'`.
    const reasoningByTask = Object.fromEntries(
      mockedAssignTask.mock.calls.map(
        (call: unknown[]) => [
          call[0] as string,
          call[5] as { kind: string } | undefined,
        ],
      ),
    );
    expect(reasoningByTask['task-a']?.kind).toBe('llm_tiebreaker');
    expect(reasoningByTask['task-b']?.kind).toBe('llm_tiebreaker');
    expect(reasoningByTask['task-c']?.kind).toBe('math_only');
    expect(reasoningByTask['task-d']?.kind).toBe('math_only');
  });

  it('cap-exhausted variant: when checkAndIncrement returns allowed:false, chat is NEVER called and all tasks fall back to math top-1', async () => {
    const taskA = makeTask('task-a');
    const taskB = makeTask('task-b');

    mockedListTeammates.mockResolvedValue([tmA, tmB, tmC]);
    mockedListUnassigned.mockResolvedValue([taskA, taskB]);

    // Both close calls (gap < 0.20).
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmA, 0.80),
      makeMatch(tmB, 0.75),
    ]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmB, 0.78),
      makeMatch(tmA, 0.73),
    ]);

    mockedCheckAndIncrement.mockResolvedValue({
      allowed: false,
      callsToday: 50,
      reason: 'cap_exceeded',
    });

    await runDispatch('t');

    // chat is NEVER called because the cap blocks us.
    expect(mockedChat).not.toHaveBeenCalled();

    // alertCapExceededOnce is invoked exactly once for the run.
    expect(mockedAlertCap).toHaveBeenCalledTimes(1);

    // Both tasks fall back to math top-1.
    expect(mockedAssignTask).toHaveBeenCalledTimes(2);
    const assignCalls = mockedAssignTask.mock.calls.map(
      (call: unknown[]) => ({ taskId: call[0], teammateId: call[1] }),
    );
    const byTask = Object.fromEntries(assignCalls.map((c: { taskId: unknown; teammateId: unknown }) => [c.taskId, c.teammateId]));
    expect(byTask['task-a']).toBe(tmA.id);  // math top-1
    expect(byTask['task-b']).toBe(tmB.id);  // math top-1
  });

  it('judge-throws variant: chat throws → math fallback for everyone (JUDGE-05)', async () => {
    const taskA = makeTask('task-a');
    mockedListTeammates.mockResolvedValue([tmA, tmB, tmC]);
    mockedListUnassigned.mockResolvedValue([taskA]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmA, 0.80),
      makeMatch(tmB, 0.75),
    ]);
    mockedCheckAndIncrement.mockResolvedValue({ allowed: true, callsToday: 1 });
    mockedChat.mockRejectedValueOnce(new Error('upstream timeout'));

    await runDispatch('t');

    // chat was attempted once.
    expect(mockedChat).toHaveBeenCalledTimes(1);
    // assignment proceeds with math top-1 anyway.
    expect(mockedAssignTask).toHaveBeenCalledTimes(1);
    const assignCall = mockedAssignTask.mock.calls[0];
    expect(assignCall[1]).toBe(tmA.id);  // math top-1
  });

  it('no close-calls → chat NOT called and checkAndIncrement NOT called (JUDGE-02)', async () => {
    const taskC = makeTask('task-c');
    const taskD = makeTask('task-d');

    mockedListTeammates.mockResolvedValue([tmA, tmB, tmC]);
    mockedListUnassigned.mockResolvedValue([taskC, taskD]);

    // Both clear winners (gap = 0.30 > 0.20).
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmA, 0.80),
      makeMatch(tmC, 0.50),
    ]);
    mockedRankMatches.mockReturnValueOnce([
      makeMatch(tmB, 0.85),
      makeMatch(tmC, 0.50),
    ]);

    await runDispatch('t');

    expect(mockedChat).not.toHaveBeenCalled();
    expect(mockedCheckAndIncrement).not.toHaveBeenCalled();
    expect(mockedAssignTask).toHaveBeenCalledTimes(2);
  });
});
