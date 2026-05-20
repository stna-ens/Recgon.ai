// Phase 4 / Plan 02 — viewer-discriminated description on the recgon
// tasks GET route.
//
// Scenarios:
//   1. Assignee fetches with personalized populated for them → response.description
//      equals the personalized text (NOT the original).
//   2. Owner fetches → response.description equals the ORIGINAL (never the
//      personalized text, even though the column has a value).
//   3. Other teammate (member, not assignee) fetches → response.description
//      equals the ORIGINAL.
//   4. Assignee fetches when personalizedDescription is null (worker hasn't run
//      yet) → response.description equals the ORIGINAL (graceful fallback).
//   5. Assignee fetches when personalizedDescriptionForUserId !== session.user.id
//      (stale row mid-reassignment; Plan 04-03 invalidation hasn't swept yet)
//      → response.description equals the ORIGINAL (FRAME-04 read-boundary
//      safety net; T-04-02-02 mitigation).
//   6. The response body NEVER contains `personalizedDescription`,
//      `personalized_description`, `personalizedDescriptionForUserId`, or
//      `personalized_description_for_user_id` under ANY casing — destructure
//      + overwrite, not spread (T-04-02-01 mitigation).
//   7. Anonymous request (no session) → 401 (regression check).
//   8. User not on team → 403 (regression check).

import { describe, expect, it, beforeEach, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockGetTask = vi.fn();
const mockGetTeammate = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  getTeammate: (...args: unknown[]) => mockGetTeammate(...args),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

// renderWhyYou is invoked when assignmentReasoning is present + viewer is
// authorized. We mock it so these tests don't touch the LLM provider chain.
vi.mock('@/lib/recgon/whyYou', () => ({
  renderWhyYou: vi.fn(async () => ({ sentence: 'mocked why-you sentence' })),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const teamId = 'team-1';
const assigneeTeammateId = 'tm-assignee';
const assigneeUserId = 'user-assignee';
const ownerUserId = 'user-owner';
const otherMemberUserId = 'user-other-member';

const ORIGINAL_DESCRIPTION = 'Add JWT refresh-token rotation to the auth route.';
const PERSONALIZED_DESCRIPTION =
  'Hey, the auth route is squarely in your TypeScript wheelhouse — start with the rotation handler.';

const baseTask = {
  id: 'task-1',
  teamId,
  assignedTo: assigneeTeammateId,
  title: 'Rotate refresh tokens',
  description: ORIGINAL_DESCRIPTION,
  status: 'assigned',
  // No assignmentReasoning on this fixture — keeps whyYouSentence out of the
  // assertions so we focus on description discrimination.
  assignmentReasoning: null,
  // Phase 4 fields — defaulted on baseTask; individual tests override.
  personalizedDescription: PERSONALIZED_DESCRIPTION,
  personalizedDescriptionForUserId: assigneeUserId,
};

const assigneeTeammate = {
  id: assigneeTeammateId,
  userId: assigneeUserId,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetTask.mockResolvedValue({ ...baseTask });
  mockGetTeammate.mockResolvedValue(assigneeTeammate);
});

async function callGET(taskId = 'task-1') {
  const { GET } = await import('@/app/api/recgon/tasks/[id]/route');
  const params = Promise.resolve({ id: taskId });
  return GET(new Request(`http://localhost/api/recgon/tasks/${taskId}`), { params });
}

const PERSONALIZED_KEY_FORMS = [
  'personalizedDescription',
  'personalized_description',
  'personalizedDescriptionForUserId',
  'personalized_description_for_user_id',
];

function expectNoPersonalizedKeys(body: { task: Record<string, unknown> }) {
  const keys = Object.keys(body.task);
  for (const forbidden of PERSONALIZED_KEY_FORMS) {
    expect(keys).not.toContain(forbidden);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/recgon/tasks/[id] — personalized-description viewer discrimination', () => {
  it('1. assignee fetches → description = personalized text', async () => {
    mockAuth.mockResolvedValue({ user: { id: assigneeUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.description).toBe(PERSONALIZED_DESCRIPTION);
    expectNoPersonalizedKeys(body);
  });

  it('2. owner fetches → description = ORIGINAL (never personalized)', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.description).toBe(ORIGINAL_DESCRIPTION);
    expect(body.task.description).not.toBe(PERSONALIZED_DESCRIPTION);
    expectNoPersonalizedKeys(body);
  });

  it('3. other teammate (member, not assignee) → description = ORIGINAL', async () => {
    mockAuth.mockResolvedValue({ user: { id: otherMemberUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.description).toBe(ORIGINAL_DESCRIPTION);
    expectNoPersonalizedKeys(body);
  });

  it('4. assignee fetches when personalizedDescription IS NULL → description = ORIGINAL', async () => {
    mockGetTask.mockResolvedValue({
      ...baseTask,
      personalizedDescription: null,
      personalizedDescriptionForUserId: null,
    });
    mockAuth.mockResolvedValue({ user: { id: assigneeUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.description).toBe(ORIGINAL_DESCRIPTION);
    expectNoPersonalizedKeys(body);
  });

  it('5. assignee fetches when personalizedDescriptionForUserId !== session.user.id → ORIGINAL (race shield)', async () => {
    // Stale row: assignee row was personalized for a DIFFERENT user (the
    // previous assignee before a reassignment). Plan 04-03 sweep hasn't
    // nulled the column yet. The read boundary must refuse to serve.
    mockGetTask.mockResolvedValue({
      ...baseTask,
      personalizedDescriptionForUserId: 'user-previous-assignee',
    });
    mockAuth.mockResolvedValue({ user: { id: assigneeUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.description).toBe(ORIGINAL_DESCRIPTION);
    expect(body.task.description).not.toBe(PERSONALIZED_DESCRIPTION);
    expectNoPersonalizedKeys(body);
  });

  it('6. response carries exactly ONE description field; raw personalized keys NEVER appear (any casing)', async () => {
    // Iterate across all three viewer roles — none should leak the raw
    // personalized fields. This is the privacy regression assertion.
    const roles: Array<{ role: 'member' | 'owner'; userId: string }> = [
      { role: 'member', userId: assigneeUserId },
      { role: 'owner', userId: ownerUserId },
      { role: 'member', userId: otherMemberUserId },
    ];
    for (const { role, userId } of roles) {
      mockGetTask.mockResolvedValue({ ...baseTask });
      mockGetTeammate.mockResolvedValue(assigneeTeammate);
      mockAuth.mockResolvedValue({ user: { id: userId } });
      mockVerifyTeamAccess.mockResolvedValue(role);

      const res = await callGET();
      expect(res.status).toBe(200);
      const body = await res.json();

      // Single description field.
      expect(typeof body.task.description).toBe('string');
      // No leak under any casing.
      expectNoPersonalizedKeys(body);
      // Belt-and-suspenders: the response JSON serialised as a string must
      // not contain the snake_case column names anywhere (defends against a
      // future regression where someone spreads the raw row).
      const blob = JSON.stringify(body);
      expect(blob).not.toContain('personalized_description');
      expect(blob).not.toContain('personalized_description_for_user_id');
    }
  });

  it('7. unauthenticated → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(401);
  });

  it('8. user not on team → 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-stranger' } });
    mockVerifyTeamAccess.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(403);
  });
});
