// Phase 1 / Plan 01-04 — verify the dispatcher threads `profileMerge` through
// both entry points (`runDispatch` cron path and `dispatchTask` manual path)
// before reaching `rankMatches`. Storage and match are mocked at the module
// boundary so we can inspect exactly what the scoring function received.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module mocks --------------------------------------------------------

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

// Plan 02-04: dispatcher now loads inferred skills once per dispatch via
// `listActiveInferredSkillsForTeam`. Mock returns an empty map so Phase 1
// behavior (profileMerge sees inferred=null per teammate) is preserved.
vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  listActiveInferredSkillsForTeam: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/recgon/brain', () => ({
  readUnifiedBrain: vi.fn().mockResolvedValue({
    computedAt: '2026-05-11T00:00:00Z',
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

// --- Imports after mocks -------------------------------------------------

import { dispatchTask, runDispatch } from '@/lib/recgon/dispatcher';
import {
  listTeammatesWithStats,
  listUnassignedTasks,
  getTask,
} from '@/lib/recgon/storage';
import { listProfiles } from '@/lib/recgon/profileStorage';
import { rankMatches } from '@/lib/recgon/match';
import type {
  AgentTask,
  TeammateWithStats,
  TeammateProfile,
} from '@/lib/recgon/types';

// --- Fixtures ------------------------------------------------------------

function teammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    userId: overrides.userId ?? 'u-1',
    displayName: 'Teammate',
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
    id: 'p-1',
    teamId: 't',
    userId: overrides.userId ?? 'u-1',
    skillsRaw: [],
    strengthsRaw: [],
    interestsRaw: [],
    skillsCanonical: ['frontend'],
    strengthsCanonical: [],
    interestsCanonical: ['video'],
    weeklyCapacityHours: 20,
    createdAt: '2026-05-01',
    updatedAt: '2026-05-01',
    githubMiningConsentAt: null,
    lastScanAt: null,
    ...overrides,
  };
}

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 't',
    projectId: null,
    title: 'Build login page',
    description: 'Build the login page',
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

// --- Test helpers --------------------------------------------------------

const mockedListTeammates = listTeammatesWithStats as unknown as ReturnType<typeof vi.fn>;
const mockedListUnassigned = listUnassignedTasks as unknown as ReturnType<typeof vi.fn>;
const mockedGetTask = getTask as unknown as ReturnType<typeof vi.fn>;
const mockedListProfiles = listProfiles as unknown as ReturnType<typeof vi.fn>;
const mockedRankMatches = rankMatches as unknown as ReturnType<typeof vi.fn>;

describe('dispatcher threads profileMerge through both entry points (Plan 01-04)', () => {
  beforeEach(() => {
    mockedListTeammates.mockReset();
    mockedListUnassigned.mockReset();
    mockedGetTask.mockReset();
    mockedListProfiles.mockReset();
    mockedRankMatches.mockClear();
  });

  it('Test 1: runDispatch calls listProfiles after listTeammatesWithStats and before rankMatches', async () => {
    const callOrder: string[] = [];
    mockedListTeammates.mockImplementation(async () => {
      callOrder.push('listTeammatesWithStats');
      return [teammate({ id: 'tm-1', userId: 'u-1' })];
    });
    mockedListProfiles.mockImplementation(async () => {
      callOrder.push('listProfiles');
      return [];
    });
    mockedListUnassigned.mockResolvedValue([task()]);
    mockedRankMatches.mockImplementation((teammates, t) => {
      callOrder.push('rankMatches');
      return [];
    });

    await runDispatch('t');

    const teammateIdx = callOrder.indexOf('listTeammatesWithStats');
    const profilesIdx = callOrder.indexOf('listProfiles');
    const rankIdx = callOrder.indexOf('rankMatches');
    expect(teammateIdx).toBeGreaterThanOrEqual(0);
    expect(profilesIdx).toBeGreaterThan(teammateIdx);
    expect(rankIdx).toBeGreaterThan(profilesIdx);
  });

  it('Test 2: profile data is applied — rankMatches sees merged skills, capacity, and interests', async () => {
    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-1', userId: 'u-1', skills: ['design'], capacityHours: 40 }),
    ]);
    mockedListProfiles.mockResolvedValue([profile({ userId: 'u-1' })]);
    mockedListUnassigned.mockResolvedValue([task()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    expect(mockedRankMatches).toHaveBeenCalled();
    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    expect(teammatesArg).toHaveLength(1);
    const merged = teammatesArg[0] as TeammateWithStats & { interests?: string[] };
    expect(merged.skills).toContain('frontend');
    expect(merged.capacityHours).toBe(20);
    expect(merged.interests).toEqual(['video']);
  });

  it('Test 3 (D-08 regression): empty profiles → rankMatches receives owner-row teammates unchanged', async () => {
    const owner = teammate({ id: 'tm-1', userId: 'u-1', skills: ['design'], capacityHours: 40 });
    mockedListTeammates.mockResolvedValue([owner]);
    mockedListProfiles.mockResolvedValue([]);
    mockedListUnassigned.mockResolvedValue([task()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    expect(mockedRankMatches).toHaveBeenCalled();
    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    const merged = teammatesArg[0] as TeammateWithStats & { interests?: string[] };
    // Owner row's skills/capacity untouched.
    expect(merged.skills).toEqual(['design']);
    expect(merged.capacityHours).toBe(40);
    // interests default to [] when no profile exists (downstream callers safe to read).
    expect(merged.interests).toEqual([]);
  });

  it('Test 4: dispatchTask (manual path) also threads profileMerge', async () => {
    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-1', userId: 'u-1', skills: ['design'], capacityHours: 40 }),
    ]);
    mockedListProfiles.mockResolvedValue([profile({ userId: 'u-1' })]);
    mockedGetTask.mockResolvedValue(task({ id: 'task-1', status: 'unassigned' }));
    mockedRankMatches.mockReturnValue([]);

    await dispatchTask('t', 'task-1');

    expect(mockedListProfiles).toHaveBeenCalledWith('t');
    expect(mockedRankMatches).toHaveBeenCalled();
    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    const merged = teammatesArg[0] as TeammateWithStats & { interests?: string[] };
    expect(merged.skills).toContain('frontend');
    expect(merged.capacityHours).toBe(20);
  });

  it('Test 5: no double-merge — rankMatches teammates count equals input teammates count', async () => {
    mockedListTeammates.mockResolvedValue([
      teammate({ id: 'tm-1', userId: 'u-1' }),
      teammate({ id: 'tm-2', userId: 'u-2' }),
      teammate({ id: 'tm-3', userId: 'u-3' }),
    ]);
    mockedListProfiles.mockResolvedValue([
      profile({ userId: 'u-1' }),
      profile({ userId: 'u-2', skillsCanonical: ['backend'] }),
    ]);
    mockedListUnassigned.mockResolvedValue([task()]);
    mockedRankMatches.mockReturnValue([]);

    await runDispatch('t');

    expect(mockedRankMatches).toHaveBeenCalledTimes(1);
    const [teammatesArg] = mockedRankMatches.mock.calls[0];
    // Exactly 3 merged teammates — no duplicates from accidental double-merge.
    expect(teammatesArg).toHaveLength(3);
    // listProfiles is called once per dispatch entry (runDispatch path).
    expect(mockedListProfiles).toHaveBeenCalledTimes(1);
  });
});
