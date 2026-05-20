// Phase 4 / CR-01 — privacy regression: ensure the four task-returning
// routes outside the viewer-discriminated /api/recgon/tasks/[id] surface
// NEVER serialize the personalized columns in any casing.
//
// Routes covered:
//   1. GET /api/teams/[id]/tasks                  (list within a team)
//   2. GET /api/teams/[id]/tasks/[taskId]         (single task within a team)
//   3. GET /api/calendar                          (cross-team personal calendar)
//   4. GET /api/teams/[id]/calendar               (team calendar)
//
// For each, mock the storage layer to return a task with NON-NULL
// personalized fields and assert the response body — both as keys on the
// task object AND as a `JSON.stringify` substring — contains neither the
// camelCase nor the snake_case forms of `personalizedDescription` and
// `personalizedDescriptionForUserId`. Tested across viewer roles where
// applicable (assignee / owner / other member).

import { describe, expect, it, beforeEach, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockListTasks = vi.fn();
const mockGetTask = vi.fn();
const mockListScheduledTasksForUser = vi.fn();
const mockListTeammatesWithStats = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  getTask: (...args: unknown[]) => mockGetTask(...args),
  listScheduledTasksForUser: (...args: unknown[]) => mockListScheduledTasksForUser(...args),
  listTeammatesWithStats: (...args: unknown[]) => mockListTeammatesWithStats(...args),
  // The single-task route also imports these but they aren't exercised on the
  // GET path; we stub them to satisfy the import binding.
  deleteTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

const mockVerifyTeamAccess = vi.fn();
const mockVerifyTeamWriteAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
  verifyTeamWriteAccess: (...args: unknown[]) => mockVerifyTeamWriteAccess(...args),
}));

// The /api/calendar route hits supabase directly for `teams`, `teammates`
// (lane-stability lookup), `agent_tasks` (project_id lookup) and
// `projects`. We stub each chained call to return empty arrays — the
// privacy assertion only depends on `tasks`, which comes from
// `listScheduledTasksForUser`.
type SupabaseResult = { data: unknown; error: { message: string } | null };
const supabaseStub = {
  from(_table: string) {
    const chain = {
      select(_cols: string) {
        return chain;
      },
      in(_col: string, _vals: unknown[]) {
        return chain;
      },
      eq(_col: string, _val: unknown) {
        return chain;
      },
      neq(_col: string, _val: unknown) {
        return chain;
      },
      not(_col: string, _op: string, _val: unknown) {
        return chain;
      },
      // Promise interface — `await supabase.from(...).select(...)...` resolves
      // to { data: [], error: null }.
      then(
        onfulfilled: (value: SupabaseResult) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
      },
    };
    return chain;
  },
};

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseStub,
}));

// /api/teams/[id]/tasks POST path imports these but GET doesn't call them.
vi.mock('@/lib/recgon/taskMint', () => ({ mintUserTask: vi.fn() }));
vi.mock('@/lib/recgon/dispatcher', () => ({ dispatchTask: vi.fn() }));

// ── Fixtures ───────────────────────────────────────────────────────────────

const teamId = 'team-1';
const taskId = 'task-1';
const assigneeTeammateId = 'tm-assignee';
const assigneeUserId = 'user-assignee';
const ownerUserId = 'user-owner';
const otherMemberUserId = 'user-other-member';

const PERSONALIZED_DESCRIPTION =
  'Hey, the auth route is squarely in your TypeScript wheelhouse — start with the rotation handler.';

// AgentTask shape — the mapped row that storage layer returns. We give it
// NON-NULL personalized fields so any leak surfaces in the assertions.
const taskWithPersonalized = {
  id: taskId,
  teamId,
  projectId: 'proj-1',
  title: 'Rotate refresh tokens',
  description: 'Add JWT refresh-token rotation to the auth route.',
  kind: 'dev_prompt' as const,
  status: 'assigned' as const,
  source: 'brain' as const,
  assignedTo: assigneeTeammateId,
  assignmentReasoning: null,
  triageNote: null,
  scheduledDate: '2026-05-21',
  scheduledUntilDate: null,
  estimatedHours: 2,
  deadline: null,
  requiredSkills: ['typescript'],
  priority: 5,
  createdBy: ownerUserId,
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
  personalizedDescription: PERSONALIZED_DESCRIPTION,
  personalizedDescriptionForUserId: assigneeUserId,
};

const PERSONALIZED_KEY_FORMS = [
  'personalizedDescription',
  'personalized_description',
  'personalizedDescriptionForUserId',
  'personalized_description_for_user_id',
];

function expectNoPersonalizedSubstrings(body: unknown): void {
  const blob = JSON.stringify(body);
  for (const forbidden of PERSONALIZED_KEY_FORMS) {
    expect(blob).not.toContain(forbidden);
  }
  // Also defend against future telemetry that might log the value text.
  expect(blob).not.toContain(PERSONALIZED_DESCRIPTION);
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── 1. /api/teams/[id]/tasks (list) ────────────────────────────────────────

describe('GET /api/teams/[id]/tasks — strips personalized fields', () => {
  async function callGET(viewerUserId: string, role: 'owner' | 'member') {
    mockAuth.mockResolvedValue({ user: { id: viewerUserId } });
    mockVerifyTeamAccess.mockResolvedValue(role);
    mockListTasks.mockResolvedValue([{ ...taskWithPersonalized }]);
    const { GET } = await import('@/app/api/teams/[id]/tasks/route');
    const params = Promise.resolve({ id: teamId });
    return GET(
      new Request(`http://localhost/api/teams/${teamId}/tasks`) as never,
      { params },
    );
  }

  it.each([
    ['assignee', assigneeUserId, 'member' as const],
    ['owner', ownerUserId, 'owner' as const],
    ['other member', otherMemberUserId, 'member' as const],
  ])('%s viewer → response carries no personalized keys (any casing)', async (_label, uid, role) => {
    const res = await callGET(uid, role);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expectNoPersonalizedSubstrings(body);
  });
});

// ── 2. /api/teams/[id]/tasks/[taskId] (single) ─────────────────────────────

describe('GET /api/teams/[id]/tasks/[taskId] — strips personalized fields', () => {
  async function callGET(viewerUserId: string, role: 'owner' | 'member') {
    mockAuth.mockResolvedValue({ user: { id: viewerUserId } });
    mockVerifyTeamAccess.mockResolvedValue(role);
    mockGetTask.mockResolvedValue({ ...taskWithPersonalized });
    const { GET } = await import('@/app/api/teams/[id]/tasks/[taskId]/route');
    const params = Promise.resolve({ id: teamId, taskId });
    return GET(
      new Request(`http://localhost/api/teams/${teamId}/tasks/${taskId}`) as never,
      { params },
    );
  }

  it.each([
    ['assignee', assigneeUserId, 'member' as const],
    ['owner', ownerUserId, 'owner' as const],
    ['other member', otherMemberUserId, 'member' as const],
  ])('%s viewer → response carries no personalized keys (any casing)', async (_label, uid, role) => {
    const res = await callGET(uid, role);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task).toBeDefined();
    expectNoPersonalizedSubstrings(body);
  });
});

// ── 3. /api/calendar (cross-team personal calendar) ────────────────────────

describe('GET /api/calendar — strips personalized fields', () => {
  async function callGET(viewerUserId: string) {
    mockAuth.mockResolvedValue({ user: { id: viewerUserId } });
    mockListScheduledTasksForUser.mockResolvedValue([{ ...taskWithPersonalized }]);
    const { GET } = await import('@/app/api/calendar/route');
    return GET(
      new Request(
        `http://localhost/api/calendar?from=2026-05-18&to=2026-05-24`,
      ) as never,
    );
  }

  it.each([
    ['assignee', assigneeUserId],
    ['other member (edge case where task somehow surfaces)', otherMemberUserId],
  ])('%s viewer → response carries no personalized keys (any casing)', async (_label, uid) => {
    const res = await callGET(uid);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expectNoPersonalizedSubstrings(body);
  });
});

// ── 4. /api/teams/[id]/calendar (team calendar) ────────────────────────────

describe('GET /api/teams/[id]/calendar — strips personalized fields', () => {
  async function callGET(viewerUserId: string, role: 'owner' | 'member') {
    mockAuth.mockResolvedValue({ user: { id: viewerUserId } });
    mockVerifyTeamAccess.mockResolvedValue(role);
    mockListTeammatesWithStats.mockResolvedValue([]);
    mockListTasks.mockResolvedValue([{ ...taskWithPersonalized }]);
    const { GET } = await import('@/app/api/teams/[id]/calendar/route');
    const params = Promise.resolve({ id: teamId });
    return GET(
      new Request(`http://localhost/api/teams/${teamId}/calendar`) as never,
      { params },
    );
  }

  it.each([
    ['assignee', assigneeUserId, 'member' as const],
    ['owner', ownerUserId, 'owner' as const],
    ['other member', otherMemberUserId, 'member' as const],
  ])('%s viewer → response carries no personalized keys (any casing)', async (_label, uid, role) => {
    const res = await callGET(uid, role);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expectNoPersonalizedSubstrings(body);
  });
});
