// Phase 2 / Plan 02-04 — integration test: dispatcher threads the inferred-skill
// map through profileMerge so a teammate's GitHub commit history starts
// changing assignment outcomes.
//
// Closes the Phase 2 user story: "a teammate who rejected Python never has a
// Python task minted off the inferred-Python signal alone" (ROADMAP success
// criterion 3). Verified at the dispatcher seam by mocking
// `listActiveInferredSkillsForTeam` and asserting that the merged teammate
// passed to `rankMatches` reflects the accepted (not rejected) inferred row.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks (mirror dispatcherProfileMerge.test.ts shape) ---------

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

vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  listActiveInferredSkillsForTeam: vi.fn(),
}));

vi.mock('@/lib/recgon/brain', () => ({
  readUnifiedBrain: vi.fn().mockResolvedValue({
    computedAt: '2026-05-12T00:00:00Z',
    totalEntries: 0,
    byKind: {},
    entries: [],
  }),
}));

vi.mock('@/lib/recgon/taskMint', () => ({
  mintTasksFromBrain: vi.fn().mockResolvedValue({ minted: [], skipped: 0 }),
}));

vi.mock('@/lib/recgon/match', async () => {
  const actual = await vi.importActual<typeof import('@/lib/recgon/match')>(
    '@/lib/recgon/match',
  );
  return {
    ...actual,
    rankMatches: vi.fn(actual.rankMatches),
  };
});

vi.mock('@/lib/recgon/scheduler', () => ({
  planTaskSchedule: vi.fn().mockReturnValue({
    scheduledDate: '2026-05-13',
    deadline: '2026-05-14',
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

// --- Imports after mocks -------------------------------------------------

import { runDispatch } from '@/lib/recgon/dispatcher';
import {
  listTeammatesWithStats,
  listUnassignedTasks,
} from '@/lib/recgon/storage';
import { listProfiles } from '@/lib/recgon/profileStorage';
import { listActiveInferredSkillsForTeam } from '@/lib/recgon/inferredSkillsStorage';
import { rankMatches } from '@/lib/recgon/match';
import { makeAccepted, makeRejected } from '@/lib/recgon/__tests__-helpers/inferredSkillsFixtures';
import type {
  AgentTask,
  TeammateWithStats,
  TeammateProfile,
  InferredSkill,
} from '@/lib/recgon/types';

// --- Fixtures ------------------------------------------------------------

function teammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    userId: overrides.userId ?? 'u-1',
    displayName: 'Teammate',
    skills: ['frontend'],
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
    id: 'p-1',
    teamId: 't',
    userId: overrides.userId ?? 'u-1',
    skillsRaw: [],
    strengthsRaw: [],
    interestsRaw: [],
    skillsCanonical: ['frontend'],
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

function pythonTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 't',
    projectId: null,
    title: 'Build Python data pipeline',
    description: 'Pipeline for the analytics ingest',
    kind: 'dev_prompt',
    source: 'user',
    sourceRef: {},
    requiredSkills: ['python'],
    priority: 1,
    estimatedHours: 2,
    deadline: null,
    assignedTo: null,
    assignedBy: null,
    assignedAt: null,
    status: 'unassigned',
    jobId: null,
    result: null,
    createdBy: 'u-1',
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
    ...overrides,
  };
}

const mockedListTeammates = listTeammatesWithStats as unknown as ReturnType<typeof vi.fn>;
const mockedListUnassigned = listUnassignedTasks as unknown as ReturnType<typeof vi.fn>;
const mockedListProfiles = listProfiles as unknown as ReturnType<typeof vi.fn>;
const mockedListInferred = listActiveInferredSkillsForTeam as unknown as ReturnType<typeof vi.fn>;
const mockedRankMatches = rankMatches as unknown as ReturnType<typeof vi.fn>;

describe('dispatcher — 3-source blend (Plan 02-04 / SKILL-04)', () => {
  beforeEach(() => {
    mockedListTeammates.mockReset();
    mockedListUnassigned.mockReset();
    mockedListProfiles.mockReset();
    mockedListInferred.mockReset();
    mockedRankMatches.mockClear();
  });

  it('loads inferred skills once per runDispatch (T-02-22 — no N+1)', async () => {
    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-1', userId: 'u-1' }),
      teammate({ id: 'tm-2', userId: 'u-2' }),
      teammate({ id: 'tm-3', userId: 'u-3' }),
    ]);
    mockedListProfiles.mockResolvedValue([]);
    mockedListInferred.mockResolvedValue(new Map());
    mockedListUnassigned.mockResolvedValue([pythonTask()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    // Called EXACTLY once — proves the single-batch contract.
    expect(mockedListInferred).toHaveBeenCalledTimes(1);
    expect(mockedListInferred).toHaveBeenCalledWith('t');
  });

  it('rejected-Python teammate does NOT receive Python in merged skills (ROADMAP #3)', async () => {
    // Teammate A: ACCEPTED python inferred (score 0.9, recent)
    // Teammate B: REJECTED python inferred (rejectedAt set)
    // Both have self-declared `frontend` only.
    const acceptedPython = makeAccepted('python', {
      teammateId: 'tm-A',
      teamId: 't',
      score: 0.9,
      daysAgo: 7,
    });
    const rejectedPython = makeRejected('python', {
      teammateId: 'tm-B',
      teamId: 't',
      score: 0.9,
      daysAgo: 7,
      rejectedDaysAgo: 1,
    });

    const inferredMap = new Map<string, Map<string, InferredSkill>>([
      ['tm-A', new Map([['python', acceptedPython]])],
      // tm-B's rejected row would be filtered at SQL level — simulate the
      // production path by NOT including it in the map at all. The
      // listActiveInferredSkillsForTeam SQL helper does this via
      // `.is('rejected_at', null)`; tm-B simply has no active inferred rows.
    ]);

    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-A', userId: 'u-A', skills: ['frontend'] }),
      teammate({ id: 'tm-B', userId: 'u-B', skills: ['frontend'] }),
    ]);
    mockedListProfiles.mockResolvedValue([
      profile({ userId: 'u-A', skillsCanonical: ['frontend'] }),
      profile({ userId: 'u-B', skillsCanonical: ['frontend'] }),
    ]);
    mockedListInferred.mockResolvedValue(inferredMap);
    mockedListUnassigned.mockResolvedValue([pythonTask()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    expect(mockedRankMatches).toHaveBeenCalled();
    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    const tmA = (teammatesArg as Array<TeammateWithStats & { interests?: string[] }>).find(
      (t) => t.id === 'tm-A',
    );
    const tmB = (teammatesArg as Array<TeammateWithStats & { interests?: string[] }>).find(
      (t) => t.id === 'tm-B',
    );
    expect(tmA).toBeDefined();
    expect(tmB).toBeDefined();
    // Teammate A: python surfaces (accepted inferred row blended in).
    expect(tmA!.skills).toContain('python');
    expect(tmA!.skills).toContain('frontend');
    // Teammate B: python does NOT surface (rejected → not in inferred map →
    // not in merged skills). This is the Phase 2 user-story guarantee.
    expect(tmB!.skills).not.toContain('python');
    expect(tmB!.skills).toContain('frontend');
  });

  it('belt-and-suspenders: if a rejected row LEAKS through the SQL filter, profileMerge still excludes it', async () => {
    // Simulate a hypothetical storage bug — a rejected row appears in the
    // inferredByTeammate map for tm-B anyway. profileMerge's in-merge check
    // (T-02-20 defense-in-depth) must still keep python out of tm-B's skills.
    const leakedRejected = makeRejected('python', {
      teammateId: 'tm-B',
      teamId: 't',
      score: 0.9,
      daysAgo: 7,
      rejectedDaysAgo: 1,
    });

    const inferredMap = new Map<string, Map<string, InferredSkill>>([
      ['tm-B', new Map([['python', leakedRejected]])],
    ]);

    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-B', userId: 'u-B', skills: ['frontend'] }),
    ]);
    mockedListProfiles.mockResolvedValue([
      profile({ userId: 'u-B', skillsCanonical: ['frontend'] }),
    ]);
    mockedListInferred.mockResolvedValue(inferredMap);
    mockedListUnassigned.mockResolvedValue([pythonTask()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    const tmB = (teammatesArg as Array<TeammateWithStats & { interests?: string[] }>).find(
      (t) => t.id === 'tm-B',
    );
    expect(tmB!.skills).not.toContain('python');
  });

  it('empty inferred map → Phase 1 regression behavior (no merged-skill change)', async () => {
    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-1', userId: 'u-1', skills: ['design'], capacityHours: 40 }),
    ]);
    mockedListProfiles.mockResolvedValue([
      profile({ userId: 'u-1', skillsCanonical: ['frontend'] }),
    ]);
    // No inferred rows for the team.
    mockedListInferred.mockResolvedValue(new Map());
    mockedListUnassigned.mockResolvedValue([pythonTask()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    const merged = teammatesArg[0] as TeammateWithStats & { interests?: string[] };
    expect(merged.skills).toContain('frontend');
    // No inferred → no python.
    expect(merged.skills).not.toContain('python');
  });
});
