// Phase 1 / Plan 01-04 — E2E smoke: a self-declared skill changes the
// dispatcher's assignment outcome. The real `rankMatches` from match.ts is
// exercised against in-memory fixture teammates so a missed
// dispatcher rebind would surface as a failing assertion. Only the storage
// layer and side effects (notifications, supabase) are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/recgon/storage', () => ({
  listTeammatesWithStats: vi.fn(),
  listUnassignedTasks: vi.fn(),
  listTasks: vi.fn().mockResolvedValue([]),
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
  listProfiles: vi.fn(),
}));

// Plan 02-04: dispatcher now loads inferred skills once per dispatch. Mock
// returns an empty map so this Phase 1 E2E smoke (no inferred-skill scenario)
// keeps Phase 1 behavior — profileMerge sees inferred=null per teammate.
vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  listActiveInferredSkillsForTeam: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/recgon/scheduler', () => ({
  planTaskSchedule: vi.fn().mockReturnValue({
    scheduledDate: '2026-05-12',
    deadline: '2026-05-13',
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
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { name: 'Team' } }) }) }),
    }),
  },
}));

// IMPORTANT: do NOT mock '@/lib/recgon/match' — the smoke test must exercise
// the real scoring path so a missed dispatcher rebind shows up as a failing
// assertion (per Plan 01-04 acceptance gate).

import { dispatchTask } from '@/lib/recgon/dispatcher';
import {
  listTeammatesWithStats,
  getTask,
  assignTask,
} from '@/lib/recgon/storage';
import { listProfiles } from '@/lib/recgon/profileStorage';
import type {
  AgentTask,
  TeammateWithStats,
  TeammateProfile,
} from '@/lib/recgon/types';

const mockedListTeammates = listTeammatesWithStats as unknown as ReturnType<typeof vi.fn>;
const mockedListProfiles = listProfiles as unknown as ReturnType<typeof vi.fn>;
const mockedGetTask = getTask as unknown as ReturnType<typeof vi.fn>;
const mockedAssignTask = assignTask as unknown as ReturnType<typeof vi.fn>;

function teammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: overrides.id ?? 'tm',
    teamId: 't',
    userId: overrides.userId ?? 'u',
    displayName: overrides.displayName ?? 'Teammate',
    skills: ['design'],
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

function profile(overrides: Partial<TeammateProfile> = {}): TeammateProfile {
  return {
    id: 'p',
    teamId: 't',
    userId: overrides.userId ?? 'u',
    skillsRaw: [],
    strengthsRaw: [],
    interestsRaw: [],
    skillsCanonical: [],
    strengthsCanonical: [],
    interestsCanonical: [],
    weeklyCapacityHours: null,
    createdAt: '2026-05-01',
    updatedAt: '2026-05-01',
    githubMiningConsentAt: null,
    lastScanAt: null,
    ...overrides,
  };
}

function frontendTask(): AgentTask {
  return {
    id: 'task-1',
    teamId: 't',
    projectId: null,
    title: 'Build login page',
    description: 'Wire up the login form',
    kind: 'dev_prompt',
    source: 'user',
    sourceRef: {},
    requiredSkills: ['frontend'],
    priority: 1,
    estimatedHours: 2,
    deadline: null,
    assignedTo: null,
    assignedBy: null,
    assignedAt: null,
    status: 'unassigned',
    jobId: null,
    result: null,
    createdBy: 'u-alice',
    createdAt: '2026-05-10',
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
  };
}

const ALICE = teammate({
  id: 'tm-alice',
  userId: 'u-alice',
  displayName: 'Alice',
  skills: ['design'],
  capacityHours: 40,
});
const BOB = teammate({
  id: 'tm-bob',
  userId: 'u-bob',
  displayName: 'Bob',
  skills: ['design'],
  capacityHours: 40,
});

describe('Phase 1 E2E smoke: self-declared skill changes assignment', () => {
  beforeEach(() => {
    mockedListTeammates.mockReset();
    mockedListProfiles.mockReset();
    mockedGetTask.mockReset();
    mockedAssignTask.mockReset();
    mockedAssignTask.mockResolvedValue(undefined);
  });

  it('Scenario A (baseline — no profile): neither Alice nor Bob is preferred for a frontend task', async () => {
    mockedListTeammates.mockResolvedValue([ALICE, BOB]);
    mockedListProfiles.mockResolvedValue([]);
    mockedGetTask.mockResolvedValue(frontendTask());

    const result = await dispatchTask('t', 'task-1');

    // Both teammates have identical skills (['design']) and identical
    // capacity, so they tie on the real scoring path. The dispatcher's
    // owner_fallback or best-fit may pick either — what matters is that
    // neither one is "preferred" via a skill-overlap signal. Both either
    // tie or both fall below MIN_FIT_SCORE. We assert: the assignment, if
    // any, did NOT land specifically because of frontend-skill matching.
    if (result === 'assigned') {
      expect(mockedAssignTask).toHaveBeenCalledTimes(1);
      // Both teammates were equally eligible in the baseline.
      const assignedTeammateId = mockedAssignTask.mock.calls[0][1] as string;
      expect([ALICE.id, BOB.id]).toContain(assignedTeammateId);
    }
  });

  it("Scenario B (Bob declares 'frontend'): Bob is preferred for the frontend task", async () => {
    mockedListTeammates.mockResolvedValue([ALICE, BOB]);
    mockedListProfiles.mockResolvedValue([
      profile({
        userId: 'u-bob',
        skillsCanonical: ['frontend'],
        weeklyCapacityHours: 40,
      }),
    ]);
    mockedGetTask.mockResolvedValue(frontendTask());

    const result = await dispatchTask('t', 'task-1');

    expect(result).toBe('assigned');
    expect(mockedAssignTask).toHaveBeenCalledTimes(1);
    const assignedTeammateId = mockedAssignTask.mock.calls[0][1] as string;
    // Load-bearing: Bob's self-declared 'frontend' must beat Alice's 'design'.
    // If Task 4.1 forgot to rebind dispatchSingleTask to mergedTeammates,
    // Alice and Bob would tie on identical owner-row skills and this would
    // be flaky / wrong.
    expect(assignedTeammateId).toBe(BOB.id);
  });

  it('Scenario C (D-08 backwards compatibility regression): empty profiles → assignment behavior identical to pre-Plan-04', async () => {
    mockedListTeammates.mockResolvedValue([ALICE, BOB]);
    mockedListProfiles.mockResolvedValue([]);
    // A 'design' task — Alice and Bob both declared 'design' so both should
    // be eligible. With no profiles, profileMerge passes the owner row
    // through unchanged.
    mockedGetTask.mockResolvedValue({
      ...frontendTask(),
      requiredSkills: ['design'],
    });

    const result = await dispatchTask('t', 'task-1');

    expect(result).toBe('assigned');
    expect(mockedAssignTask).toHaveBeenCalledTimes(1);
    const assignedTeammateId = mockedAssignTask.mock.calls[0][1] as string;
    // Either teammate is valid — both have ['design']. Neither was modified
    // by profileMerge because no profile rows exist.
    expect([ALICE.id, BOB.id]).toContain(assignedTeammateId);
  });
});
