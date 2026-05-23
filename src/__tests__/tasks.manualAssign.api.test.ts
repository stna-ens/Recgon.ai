// Phase 3 / Plan 03-07 — Manual-assign API endpoint owner-gated coverage.
//
// Scenarios:
//   1. Owner POSTs with valid assigneeId
//        → 200, assignTask called once with reasoning {kind:'math_only', mathScore:0,
//          mathBreakdown:zero, whyYouSentence:'Owner manually assigned — no automatic fit found.'},
//          clearTriageNote called once, logEvent called with event:'manually_assigned'.
//   2. Non-owner (member) POSTs → 403.
//   3. Owner POSTs invalid assigneeId (non-team-member) → 400.
//   4. Task already assigned (status !== 'unassigned') → 409.
//   5. Unauthenticated → 401.
//
// The route at `src/app/api/recgon/tasks/[id]/assign/route.ts` does:
//   - auth() → session
//   - getTask → AgentTask (with teamId, status)
//   - verifyTeamAccess(teamId, userId) → role; reject non-owner with 403
//   - validate body {assigneeId: string}; reject missing/non-string with 400
//   - validate assigneeId is a teammate of task.teamId (listTeammates); 400 otherwise
//   - if task.status !== 'unassigned' → 409
//   - build math_only reasoning with zero math + whyYouSentence
//   - assignTask(taskId, assigneeId, session.user.id, null, {scheduleNote:...}, reasoning)
//   - clearTriageNote(taskId)
//   - logEvent({teamId, teammateId:assigneeId, taskId, event:'manually_assigned',
//              payload:{owner_user_id, assignee_id, prior_triage_note}})
//   - return { ok: true, taskId, assigneeId }

import { describe, expect, it, beforeEach, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockGetTask = vi.fn();
const mockListTeammates = vi.fn();
const mockAssignTask = vi.fn();
const mockClearTriageNote = vi.fn();
const mockLogEvent = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  listTeammates: (...args: unknown[]) => mockListTeammates(...args),
  assignTask: (...args: unknown[]) => mockAssignTask(...args),
  clearTriageNote: (...args: unknown[]) => mockClearTriageNote(...args),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

const mockEnqueueReframeJob = vi.fn();
vi.mock('@/lib/recgon/reframeEnqueue', () => ({
  enqueueReframeJob: (...args: unknown[]) => mockEnqueueReframeJob(...args),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const teamId = 'team-1';
const taskId = 'task-1';
const ownerUserId = 'user-owner';
const memberUserId = 'user-member';

const teammate1 = { id: 'tm-1', teamId, userId: 'user-1', displayName: 'Alice', skills: [], status: 'active' };
const teammate2 = { id: 'tm-2', teamId, userId: 'user-2', displayName: 'Bob', skills: [], status: 'active' };

const unassignedTaskFixture = {
  id: taskId,
  teamId,
  title: 'Fix login bug',
  status: 'unassigned',
  assignedTo: null,
  triageNote: 'no_clear_fit' as const,
};

const assignedTaskFixture = {
  ...unassignedTaskFixture,
  status: 'assigned',
  assignedTo: 'tm-9',
  triageNote: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockListTeammates.mockResolvedValue([teammate1, teammate2]);
  mockAssignTask.mockResolvedValue(undefined);
  mockClearTriageNote.mockResolvedValue(undefined);
  mockLogEvent.mockResolvedValue(undefined);
  mockEnqueueReframeJob.mockResolvedValue(undefined);
});

async function callPOST(body: unknown, id = taskId) {
  const { POST } = await import('@/app/api/recgon/tasks/[id]/assign/route');
  const params = Promise.resolve({ id });
  return POST(
    new Request(`http://localhost/api/recgon/tasks/${id}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params },
  );
}

describe('POST /api/recgon/tasks/[id]/assign — manual-assign endpoint', () => {
  it('unauthenticated → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callPOST({ assigneeId: 'tm-1' });
    expect(res.status).toBe(401);
    expect(mockAssignTask).not.toHaveBeenCalled();
  });

  it('non-owner (member) → 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: memberUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callPOST({ assigneeId: 'tm-1' });
    expect(res.status).toBe(403);
    expect(mockAssignTask).not.toHaveBeenCalled();
    expect(mockClearTriageNote).not.toHaveBeenCalled();
  });

  it('owner with invalid (non-team-member) assigneeId → 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ assigneeId: 'tm-bogus' });
    expect(res.status).toBe(400);
    expect(mockAssignTask).not.toHaveBeenCalled();
  });

  it('owner with missing assigneeId → 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({});
    expect(res.status).toBe(400);
  });

  it('task already assigned → 409', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(assignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ assigneeId: 'tm-1' });
    expect(res.status).toBe(409);
    expect(mockAssignTask).not.toHaveBeenCalled();
  });

  it('owner with valid assigneeId → 200, assignTask + clearTriageNote + logEvent called', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ assigneeId: 'tm-2' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, taskId, assigneeId: 'tm-2' });

    // assignTask called once with the right shape
    expect(mockAssignTask).toHaveBeenCalledTimes(1);
    const [calledTaskId, calledAssigneeId, calledAssignedBy, , , reasoning] = mockAssignTask.mock.calls[0];
    expect(calledTaskId).toBe(taskId);
    expect(calledAssigneeId).toBe('tm-2');
    expect(calledAssignedBy).toBe(ownerUserId);
    expect(reasoning).toEqual({
      kind: 'math_only',
      mathScore: 0,
      mathBreakdown: {
        skillOverlap: 0,
        fitForKind: 0,
        availabilityNow: 0,
        loadHeadroom: 0,
        interestNudge: 0,
      },
      whyYouSentence: 'Owner manually assigned — no automatic fit found.',
    });

    // clearTriageNote called once
    expect(mockClearTriageNote).toHaveBeenCalledTimes(1);
    expect(mockClearTriageNote).toHaveBeenCalledWith(taskId);

    // Phase 4 follow-up — reframe enqueue fires for the new assignee.
    // Without this the assignee never sees personalized text for a
    // manually-assigned task.
    expect(mockEnqueueReframeJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueReframeJob).toHaveBeenCalledWith(taskId, 'tm-2', teamId);

    // logEvent called with manually_assigned + audit payload
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    const evt = mockLogEvent.mock.calls[0][0];
    expect(evt.event).toBe('manually_assigned');
    expect(evt.teamId).toBe(teamId);
    expect(evt.taskId).toBe(taskId);
    expect(evt.teammateId).toBe('tm-2');
    expect(evt.payload).toMatchObject({
      owner_user_id: ownerUserId,
      assignee_id: 'tm-2',
      prior_triage_note: 'no_clear_fit',
    });
  });

  it('reframe enqueue failure does NOT roll back the assignment (fire-and-forget contract)', async () => {
    // Phase 4 follow-up — FRAME-01 contract: a failed reframe enqueue must
    // NEVER fail the assignment. The owner's manual override is the source-
    // of-truth action; personalization is a best-effort enrichment.
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockEnqueueReframeJob.mockRejectedValue(new Error('LLM queue offline'));

    const res = await callPOST({ assigneeId: 'tm-2' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, taskId, assigneeId: 'tm-2' });

    // Assignment + audit still happened.
    expect(mockAssignTask).toHaveBeenCalledTimes(1);
    expect(mockClearTriageNote).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });

  it('owner-success audit: AssignmentReasoning is math_only with zero math and the exact sentence', async () => {
    // Plan 03-07 contract: a manually-assigned task's reasoning envelope MUST
    // declare honestly that there is no fit signal — math_only kind, zero
    // mathScore, zero mathBreakdown across all five signals. The Why-you line
    // is fixed copy because LLM grounding would have no candidate to ground.
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue({ ...unassignedTaskFixture, triageNote: 'no_grounded_reason' });
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ assigneeId: 'tm-1' });
    expect(res.status).toBe(200);

    const reasoning = mockAssignTask.mock.calls[0][5];
    expect(reasoning.kind).toBe('math_only');
    expect(reasoning.mathScore).toBe(0);
    expect(Object.values(reasoning.mathBreakdown as Record<string, number>)).toEqual([0, 0, 0, 0, 0]);
    expect(reasoning.whyYouSentence).toBe('Owner manually assigned — no automatic fit found.');

    // prior_triage_note travels onto the audit payload so the owner can later
    // reconstruct WHY the manual override was needed.
    const evt = mockLogEvent.mock.calls[0][0];
    expect(evt.payload.prior_triage_note).toBe('no_grounded_reason');
  });

  it('non-string assigneeId → 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(unassignedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ assigneeId: 123 as unknown as string });
    expect(res.status).toBe(400);
  });

  it('task not found → 404', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(null);

    const res = await callPOST({ assigneeId: 'tm-1' }, 'task-missing');
    expect(res.status).toBe(404);
  });
});
