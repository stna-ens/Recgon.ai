// Mission Control aggregation endpoint — GET /api/teams/[id]/command.
//
// Locks down three things:
//   1. CR-01 sanitization — raw assignment_reasoning / personalized columns
//      never serialize, in any casing, for any role.
//   2. Role gating — owner gets a decision stack; member gets `decisions: null`
//      (server-side gate, not a UI hide).
//   3. Decision grouping + ranking — reschedule requests, tier-3 overdue,
//      triaged (capacity-blocked high-priority first), awaiting review.

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

const mockListTasks = vi.fn();
const mockListTeammatesWithStats = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listTasks: (...args: unknown[]) => mockListTasks(...args),
  listTeammatesWithStats: (...args: unknown[]) => mockListTeammatesWithStats(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [{ id: 'proj-1', name: 'Recgon' }],
            error: null,
          }),
      }),
    }),
  },
}));

const teamId = 'team-1';
const REASONING_SENTENCE = 'Anon candidate_2 edged candidate_1 on recent commits.';

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    teamId,
    projectId: 'proj-1',
    title: 'A task',
    description: 'desc',
    kind: 'dev_prompt',
    source: 'brain',
    sourceRef: {},
    requiredSkills: [],
    priority: 2,
    estimatedHours: 1,
    deadline: null,
    assignedTo: 'tm-1',
    assignedBy: null,
    assignedAt: null,
    status: 'assigned',
    jobId: null,
    result: null,
    createdBy: null,
    createdAt: '2026-06-01T00:00:00Z',
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
    overdueTier: 0,
    lastOverdueActionAt: null,
    triageNote: null,
    assignmentReasoning: { kind: 'llm_tiebreaker', whyYouSentence: REASONING_SENTENCE },
    personalizedDescription: 'secret personalized text',
    personalizedDescriptionForUserId: 'user-x',
    ...overrides,
  };
}

async function callGET(role: 'owner' | 'member' | null) {
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  mockVerifyTeamAccess.mockResolvedValue(role);
  mockListTeammatesWithStats.mockResolvedValue([
    {
      id: 'tm-1',
      teamId,
      userId: 'user-1',
      displayName: 'Ada',
      avatarColor: '#c2357a',
      avatarUrl: null,
      skills: ['react'],
      capacityHours: 10,
      workingHours: null,
      // fitProfile holds per-skill performance internals — must NOT serialize.
      fitProfile: { 'secret-fit-data': 1 },
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      stars: 4.2,
      ratingCount: 7,
      upCount: 5,
      downCount: 2,
      inFlightCount: 2,
      inFlightHours: 5,
      teamRole: 'owner',
    },
  ]);
  const { GET } = await import('@/app/api/teams/[id]/command/route');
  const params = Promise.resolve({ id: teamId });
  return GET(new Request(`http://localhost/api/teams/${teamId}/command`) as never, { params });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/teams/[id]/command', () => {
  it('sanitizes every task (no reasoning / personalized keys in any casing)', async () => {
    mockListTasks.mockResolvedValue([
      makeTask(),
      makeTask({ status: 'unassigned', assignedTo: null, triageNote: 'no_clear_fit' }),
    ]);
    const res = await callGET('owner');
    expect(res.status).toBe(200);
    const blob = JSON.stringify(await res.json());
    for (const forbidden of [
      'assignmentReasoning',
      'assignment_reasoning',
      'personalizedDescription',
      'personalized_description',
      REASONING_SENTENCE,
      'secret personalized text',
    ]) {
      expect(blob).not.toContain(forbidden);
    }
  });

  it('member gets decisions: null but still sees the task table', async () => {
    mockListTasks.mockResolvedValue([makeTask()]);
    const res = await callGET('member');
    const body = await res.json();
    expect(body.role).toBe('member');
    expect(body.decisions).toBeNull();
    expect(body.tasks).toHaveLength(1);
  });

  it('non-member gets 403', async () => {
    const res = await callGET(null);
    expect(res.status).toBe(403);
  });

  it('groups decisions and ranks triage with capacity-blocked high-priority first', async () => {
    mockListTasks.mockResolvedValue([
      makeTask({ id: 't-resched', rescheduleRequestStatus: 'pending' }),
      makeTask({ id: 't-overdue', overdueTier: 3 }),
      makeTask({
        id: 't-triage-fit',
        status: 'unassigned',
        assignedTo: null,
        triageNote: 'no_clear_fit',
        priority: 2,
      }),
      makeTask({
        id: 't-triage-cap',
        status: 'unassigned',
        assignedTo: null,
        triageNote: 'no_capacity_high_priority',
        priority: 3,
      }),
      makeTask({ id: 't-review', status: 'awaiting_review' }),
      makeTask({ id: 't-plain' }),
      makeTask({ id: 't-done', status: 'completed', overdueTier: 3 }),
    ]);
    const res = await callGET('owner');
    const body = await res.json();
    expect(body.decisions.rescheduleRequests.map((t: { id: string }) => t.id)).toEqual([
      't-resched',
    ]);
    // Terminal tasks never count as overdue decisions.
    expect(body.decisions.overdue.map((t: { id: string }) => t.id)).toEqual(['t-overdue']);
    expect(body.decisions.triaged.map((t: { id: string }) => t.id)).toEqual([
      't-triage-cap',
      't-triage-fit',
    ]);
    expect(body.decisions.awaitingReview.map((t: { id: string }) => t.id)).toEqual(['t-review']);
  });

  it('exposes Dispatch Floor signals but never the fitProfile internals', async () => {
    mockListTasks.mockResolvedValue([]);
    const res = await callGET('owner');
    const body = await res.json();
    // Dispatch Floor contract: load headroom + skills + rating, computed
    // server-side. Skills are already visible on the team roster; load mirrors
    // Home's team-pulse. inFlightHours 5 / capacity 10 → 50%.
    expect(body.teammates[0]).toEqual({
      id: 'tm-1',
      userId: 'user-1',
      displayName: 'Ada',
      avatarColor: '#c2357a',
      avatarUrl: null,
      capacityHours: 10,
      inFlightHours: 5,
      loadPct: 50,
      isIdle: false,
      skills: ['react'],
      stars: 4.2,
    });
    // The sensitive per-skill performance map stays server-side.
    expect(JSON.stringify(body)).not.toContain('secret-fit-data');
    expect(body.teammates[0]).not.toHaveProperty('fitProfile');
    expect(body.teammates[0]).not.toHaveProperty('ratingCount');
  });
});
