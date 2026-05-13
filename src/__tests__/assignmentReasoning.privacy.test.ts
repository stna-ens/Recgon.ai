// Phase 3 Plan 03 — assignment_reasoning privacy filter on the recgon
// tasks GET route.
//
// Scenarios:
//   1. Assignee fetches → response includes `whyYouSentence`
//   2. Owner of the task's team fetches → response includes `whyYouSentence`
//   3. Other teammate (member, not assignee) fetches → `whyYouSentence` undefined
//   4. Unauthenticated request → 401 (regression check on existing auth)
//   5. Raw `assignment_reasoning` JSONB is NEVER in the response (only the
//      pre-rendered string; T-03-03-03)
//
// The route at `src/app/api/recgon/tasks/[id]/route.ts` does:
//   - auth() → session
//   - getTask → AgentTask (with assignmentReasoning + assignedTo teammateId)
//   - verifyTeamAccess(teamId, userId) → role
//   - if session.userId resolves to the assignee teammate OR role === 'owner':
//       include whyYouSentence: renderWhyYou(reasoning).sentence
//     else: omit whyYouSentence entirely
//   - NEVER include the raw `assignmentReasoning` JSONB on the response

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

// ── Fixtures ───────────────────────────────────────────────────────────────

const teamId = 'team-1';
const assigneeTeammateId = 'tm-assignee';
const assigneeUserId = 'user-assignee';
const ownerUserId = 'user-owner';
const otherMemberUserId = 'user-other-member';

const reasoning = {
  kind: 'llm_tiebreaker' as const,
  mathScore: 0.78,
  mathBreakdown: {
    skillOverlap: 0.8,
    fitForKind: 0.7,
    availabilityNow: 0.6,
    loadHeadroom: 0.5,
    interestNudge: 0,
  },
  judge: {
    task_id: 'task-1',
    chosen_candidate_id: 1 as const,
    reason_code: 'skill_depth' as const,
    reason_sentence: 'you have the deepest typescript history of the candidates.',
    confidence: 'high' as const,
  },
};

const taskFixture = {
  id: 'task-1',
  teamId,
  assignedTo: assigneeTeammateId,
  assignmentReasoning: reasoning,
  // Minimal AgentTask fields for the route — full type is large; the route
  // only reads id, teamId, assignedTo, assignmentReasoning.
  title: 'Fix login redirect',
  status: 'assigned',
};

const assigneeTeammate = {
  id: assigneeTeammateId,
  userId: assigneeUserId,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetTask.mockResolvedValue(taskFixture);
  mockGetTeammate.mockResolvedValue(assigneeTeammate);
});

async function callGET(taskId = 'task-1') {
  const { GET } = await import('@/app/api/recgon/tasks/[id]/route');
  const params = Promise.resolve({ id: taskId });
  return GET(new Request(`http://localhost/api/recgon/tasks/${taskId}`), { params });
}

// ── Scenario 1: Assignee sees the line ─────────────────────────────────────

describe('GET /api/recgon/tasks/[id] — privacy filter', () => {
  it('assignee fetches → response includes whyYouSentence', async () => {
    mockAuth.mockResolvedValue({ user: { id: assigneeUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.whyYouSentence).toBeDefined();
    expect(typeof body.task.whyYouSentence).toBe('string');
    expect(body.task.whyYouSentence).toContain('Skill depth');
  });

  it('owner of the task team → response includes whyYouSentence', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.whyYouSentence).toBeDefined();
  });

  it('other teammate (member, not assignee) → whyYouSentence undefined', async () => {
    mockAuth.mockResolvedValue({ user: { id: otherMemberUserId } });
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.whyYouSentence).toBeUndefined();
  });

  it('unauthenticated → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callGET();
    expect(res.status).toBe(401);
  });

  it('raw assignment_reasoning / assignmentReasoning JSONB is NEVER in the response', async () => {
    // All three viewer roles — none should leak the raw blob.
    for (const role of ['member', 'owner']) {
      mockAuth.mockResolvedValue({
        user: { id: role === 'owner' ? ownerUserId : assigneeUserId },
      });
      mockVerifyTeamAccess.mockResolvedValue(role);
      const res = await callGET();
      const body = await res.json();
      expect(body.task.assignmentReasoning).toBeUndefined();
      expect(body.task.assignment_reasoning).toBeUndefined();
      // The judge blob (with reason_code, reason_sentence, etc.) must not
      // be reflected back in any nested form either.
      expect(JSON.stringify(body)).not.toContain('reason_code');
      expect(JSON.stringify(body)).not.toContain('chosen_candidate_id');
      expect(JSON.stringify(body)).not.toContain('mathBreakdown');
    }
  });
});
