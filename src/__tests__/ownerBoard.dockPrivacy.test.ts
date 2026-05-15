// Phase 3.5 / Plan 03.5-02 — Privacy contract for the BULK owner-board paths.
//
// T-3.5-03 hedge: `assignment_reasoning` JSONB MUST NEVER leave the bulk
// fetch boundary. Per-chip detail (whyYouSentence) flows through the existing
// `/api/recgon/tasks/[id]` route which applies the Phase-3 privacy filter.
//
// Tests:
//   9.  Route /api/recgon/owner/dock — TRIAGED row with assignmentReasoning
//       populated in storage layer → response row excludes assignmentReasoning.
//   10. Route /api/recgon/owner/dock — DEFERRED row with assignmentReasoning
//       populated → response row excludes assignmentReasoning.
//   11. Storage helper listAssignedTasksInWindow — directly mock supabase to
//       return a row with assignment_reasoning populated → returned object
//       lacks the field.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AgentTask } from '@/lib/recgon/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockListOwnerDockTasks = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listOwnerDockTasks: (...args: unknown[]) => mockListOwnerDockTasks(...args),
  // Storage-helper test (Test 11) is split into a sibling test file
  // (`ownerBoard.listAssignedTasksInWindow.test.ts`) so vitest's
  // module-level mock doesn't clobber the live export.
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

async function callDockGET() {
  const { GET } = await import('@/app/api/recgon/owner/dock/route');
  return GET(new Request('http://localhost/api/recgon/owner/dock?teamId=team-1'));
}

// ── Route-level privacy assertions ────────────────────────────────────────

describe('GET /api/recgon/owner/dock — privacy invariants', () => {
  it('strips assignmentReasoning from triaged rows even when storage helper leaks it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    mockVerifyTeamAccess.mockResolvedValue('owner');

    // The storage helper is contracted to strip the field, but the route MUST
    // defensively re-strip anyway. We simulate a bug in the storage layer that
    // accidentally leaks reasoning, and assert the route still scrubs it.
    const leakyTriaged = {
      id: 'task-leaky-triaged',
      title: 'Triaged leaker',
      status: 'unassigned',
      triageNote: 'no_clear_fit' as const,
      assignmentReasoning: {
        kind: 'math_only' as const,
        mathScore: 0.42,
        mathBreakdown: {
          skillOverlap: 0.5,
          fitForKind: 0.3,
          availabilityNow: 1,
          loadHeadroom: 0.8,
          interestNudge: 0,
        },
        whyYouSentence: 'SECRET LEAK',
      },
    } as Partial<AgentTask>;

    mockListOwnerDockTasks.mockResolvedValue({
      triaged: [leakyTriaged],
      deferred: [],
    });

    const res = await callDockGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triaged).toHaveLength(1);
    const row = body.triaged[0];
    expect('assignmentReasoning' in row).toBe(false);
    expect('whyYouSentence' in row).toBe(false);
    // Sanity: legitimate display fields still present.
    expect(row.id).toBe('task-leaky-triaged');
    expect(row.title).toBe('Triaged leaker');
    expect(row.triageNote).toBe('no_clear_fit');
  });

  it('strips assignmentReasoning from deferred rows even when storage helper leaks it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const leakyDeferred = {
      id: 'task-leaky-deferred',
      title: 'Deferred leaker',
      status: 'unassigned',
      triageNote: null,
      scheduledDate: '2026-05-22',
      assignmentReasoning: {
        kind: 'math_only' as const,
        mathScore: 0.61,
        mathBreakdown: {
          skillOverlap: 0.7,
          fitForKind: 0.4,
          availabilityNow: 1,
          loadHeadroom: 0.5,
          interestNudge: 0.1,
        },
        whyYouSentence: 'ALSO SECRET',
      },
    } as Partial<AgentTask>;

    mockListOwnerDockTasks.mockResolvedValue({
      triaged: [],
      deferred: [leakyDeferred],
    });

    const res = await callDockGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deferred).toHaveLength(1);
    const row = body.deferred[0];
    expect('assignmentReasoning' in row).toBe(false);
    expect('whyYouSentence' in row).toBe(false);
    expect(row.scheduledDate).toBe('2026-05-22');
  });
});

// Storage-helper test (`listAssignedTasksInWindow`) lives in
// `ownerBoard.listAssignedTasksInWindow.test.ts` to avoid clobbering the
// module-level `vi.mock('@/lib/recgon/storage', ...)` above.
