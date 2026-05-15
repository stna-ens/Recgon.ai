// Phase 3.5 / Plan 03.5-01 — shared owner-board test scaffold.
//
// Exports vi.fn-backed mocks for the surfaces every owner-board test needs:
//   - useTeam (owner / member / viewer / loading)
//   - useToast (no-op spy)
//   - fetch (assign / reschedule / dock stubs)
//   - AgentTask fixtures (assigned, triaged, deferred)
//
// Layout mirrors `src/__tests__/inferredSkills.api.test.ts` — co-locate the
// vi.mock calls in each test file; this file just produces the spy
// implementations + fixture data the tests consume.
//
// Companion docs: 03.5-PATTERNS.md §test setup, 03.5-RESEARCH.md § Wave 0 Gaps.

import { vi } from 'vitest';
import type {
  AgentTask,
  Teammate,
  TeammateWithStats,
} from '@/lib/recgon/types';

// -- useTeam ------------------------------------------------------------------

export type TeamRole = 'owner' | 'member' | 'viewer';

export interface MockTeamContext {
  currentTeam: { id: string; name: string; role: TeamRole; slug?: string; createdBy?: string; createdAt?: string } | null;
  teams: Array<{ id: string; name: string; role: TeamRole; slug: string; createdBy: string; createdAt: string }>;
  loading: boolean;
  projects: null;
  projectUpdateStatuses: Record<string, boolean>;
  refreshProjects: () => void;
  setCurrentTeam: (team: unknown) => void;
  refreshTeams: () => Promise<void>;
  setProjectUpdateStatuses: (s: Record<string, boolean>) => void;
}

/**
 * Build a useTeam stub for the given role.
 *
 * Use with `vi.mock('@/components/TeamProvider', () => ({ useTeam: () => mockUseTeam('owner') }))`
 * at the top of each test file. The setup helper returns a static snapshot;
 * tests that need to swap roles should re-mock per test or use `vi.mocked`
 * to swap the return value.
 */
export function mockUseTeam(role: TeamRole, opts: { loading?: boolean; teamId?: string } = {}): MockTeamContext {
  const teamId = opts.teamId ?? 'team-1';
  if (opts.loading) {
    return {
      currentTeam: null,
      teams: [],
      loading: true,
      projects: null,
      projectUpdateStatuses: {},
      refreshProjects: vi.fn(),
      setCurrentTeam: vi.fn(),
      refreshTeams: vi.fn().mockResolvedValue(undefined),
      setProjectUpdateStatuses: vi.fn(),
    };
  }
  return {
    currentTeam: {
      id: teamId,
      name: 'Test Team',
      role,
      slug: 'test-team',
      createdBy: 'user-owner',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    teams: [
      {
        id: teamId,
        name: 'Test Team',
        role,
        slug: 'test-team',
        createdBy: 'user-owner',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    loading: false,
    projects: null,
    projectUpdateStatuses: {},
    refreshProjects: vi.fn(),
    setCurrentTeam: vi.fn(),
    refreshTeams: vi.fn().mockResolvedValue(undefined),
    setProjectUpdateStatuses: vi.fn(),
  };
}

/**
 * Build a useTeam stub representing the "team context still loading" state.
 * Useful for the role-router "no flash of view" test.
 */
export function mockUseTeamLoading(): MockTeamContext {
  return mockUseTeam('owner', { loading: true });
}

// -- useToast -----------------------------------------------------------------

export interface MockToastContext {
  addToast: ReturnType<typeof vi.fn>;
}

export function mockUseToast(): MockToastContext {
  return { addToast: vi.fn() };
}

// -- fetch helpers ------------------------------------------------------------

/**
 * Stub global.fetch with a single OK JSON response. Returns the spy so tests
 * can assert call counts / URLs / bodies.
 */
export function mockFetchOk(payload: unknown): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/**
 * Stub global.fetch with a failure response.
 */
export function mockFetchFail(status: number, message: string): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: message }),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/**
 * Stub global.fetch with a per-URL router: pass a map of URL substring → response.
 * Useful when one test exercises multiple endpoints (e.g. dock GET + assign POST).
 */
export function mockFetchByUrl(routes: Record<string, { ok?: boolean; status?: number; body: unknown }>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (url: unknown) => {
    const key = typeof url === 'string'
      ? Object.keys(routes).find((k) => url.includes(k))
      : undefined;
    const route = key ? routes[key] : undefined;
    if (!route) {
      return { ok: false, status: 404, json: async () => ({ error: 'unmocked URL' }) };
    }
    return {
      ok: route.ok ?? true,
      status: route.status ?? 200,
      json: async () => route.body,
    };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

// -- AgentTask fixtures -------------------------------------------------------

const TASK_DEFAULTS: AgentTask = {
  id: 'task-default',
  teamId: 'team-1',
  projectId: 'project-1',
  title: 'Default test task',
  description: 'Stub task body.',
  kind: 'next_step',
  source: 'brain',
  sourceRef: {},
  requiredSkills: ['frontend'],
  priority: 1,
  estimatedHours: 4,
  deadline: null,
  assignedTo: 'tm-alice',
  assignedBy: 'user-owner',
  assignedAt: '2026-05-15T00:00:00.000Z',
  status: 'assigned',
  jobId: null,
  result: null,
  createdBy: 'user-owner',
  createdAt: '2026-05-15T00:00:00.000Z',
  completedAt: null,
  proof: null,
  verificationStatus: 'none',
  verificationEvidence: null,
  verifiedAt: null,
  verifiedBy: null,
  scheduledDate: '2026-05-18',
  scheduledUntilDate: null,
  scheduleNote: null,
  rescheduleRequestStatus: 'none',
  rescheduleRequestedAt: null,
  rescheduleRequestedBy: null,
  rescheduleRequestNote: null,
  rescheduleRequestedDate: null,
  assignmentReasoning: null,
  triageNote: null,
};

/**
 * Build an AgentTask with the given overrides. Defaults form an "assigned,
 * scheduled, no triage" task — flip fields per fixture below.
 */
export function fixtureTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return { ...TASK_DEFAULTS, ...overrides };
}

/** Assigned task scheduled in the visible window — lands in a calendar cell. */
export const assignedTask: AgentTask = fixtureTask({
  id: 'task-assigned',
  title: 'Wire OAuth callback',
  status: 'assigned',
  scheduledDate: '2026-05-18',
  triageNote: null,
});

/** Triaged task (dispatcher refusal): only in dock, no calendar slot. */
export const triagedTask: AgentTask = fixtureTask({
  id: 'task-triaged',
  title: 'Refactor auth module',
  status: 'unassigned',
  assignedTo: null,
  assignedBy: null,
  assignedAt: null,
  scheduledDate: null,
  triageNote: 'no_clear_fit',
});

/** Deferred task: dispatcher pushed scheduled_date forward; appears in BOTH dock + calendar. */
export const deferredTask: AgentTask = fixtureTask({
  id: 'task-deferred',
  title: 'Investigate prod log',
  status: 'unassigned',
  assignedTo: null,
  assignedBy: null,
  assignedAt: null,
  scheduledDate: '2026-05-22', // 7d forward from a 2026-05-15 baseline
  triageNote: null,
});

// -- Teammate fixtures --------------------------------------------------------

const TEAMMATE_DEFAULTS: TeammateWithStats = {
  id: 'tm-default',
  teamId: 'team-1',
  userId: 'user-default',
  displayName: 'Test Teammate',
  avatarColor: null,
  avatarUrl: null,
  title: null,
  skills: [],
  capacityHours: 30,
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' } as Teammate['workingHours'],
  fitProfile: {} as Teammate['fitProfile'],
  status: 'active' as Teammate['status'],
  createdAt: '2026-01-01T00:00:00.000Z',
  stars: 0,
  ratingCount: 0,
  upCount: 0,
  downCount: 0,
  inFlightCount: 0,
  inFlightHours: 0,
  teamRole: 'member',
};

/** Build a TeammateWithStats fixture for an active team member. */
export function fixtureTeammate(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return { ...TEAMMATE_DEFAULTS, ...overrides };
}

export const aliceTeammate: TeammateWithStats = fixtureTeammate({
  id: 'tm-alice',
  userId: 'user-alice',
  displayName: 'alice',
  title: 'frontend',
});

export const bobTeammate: TeammateWithStats = fixtureTeammate({
  id: 'tm-bob',
  userId: 'user-bob',
  displayName: 'bob',
  title: 'backend',
});

export const carolTeammate: TeammateWithStats = fixtureTeammate({
  id: 'tm-carol',
  userId: 'user-carol',
  displayName: 'carol',
  title: 'design',
});
