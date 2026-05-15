// Phase 3.5 / Plan 03.5-02 — Storage-helper privacy invariant.
//
// Validates that `listAssignedTasksInWindow` in `recgon/storage.ts` strips
// `assignmentReasoning` from rows before returning them. This is Test 11
// from plan task 1 — split into its own file because the sibling
// `ownerBoard.dockPrivacy.test.ts` module-mocks `@/lib/recgon/storage` and
// would clobber the live export we want to exercise here.
//
// The supabase chain we mock here resolves to:
//   from('agent_tasks').select('*').eq(...).in(...).gte(...).lte(...).order(...).limit(...)
// → { data, error }

import { describe, expect, it, vi } from 'vitest';

// Mock the supabase service-role client. The builder is a thenable that
// resolves to {data, error} regardless of which chain methods are called,
// so the storage helper's query shape can evolve without breaking this test.
vi.mock('@/lib/supabase', () => {
  const rowsPayload = [
    {
      id: 'task-in-window',
      team_id: 'team-1',
      project_id: 'proj-1',
      title: 'In-window task',
      description: 'desc',
      kind: 'next_step',
      source: 'brain',
      source_ref: {},
      required_skills: [],
      priority: 1,
      estimated_hours: 2,
      deadline: null,
      assigned_to: 'tm-1',
      assigned_by: 'user-owner',
      assigned_at: '2026-05-15T00:00:00Z',
      status: 'assigned',
      job_id: null,
      result: null,
      created_by: 'user-owner',
      created_at: '2026-05-15T00:00:00Z',
      completed_at: null,
      proof: null,
      verification_status: 'none',
      verification_evidence: null,
      verified_at: null,
      verified_by: null,
      scheduled_date: '2026-05-18',
      scheduled_until_date: null,
      schedule_note: null,
      reschedule_request_status: 'none',
      reschedule_requested_at: null,
      reschedule_requested_by: null,
      reschedule_request_note: null,
      reschedule_requested_date: null,
      // The JSONB we MUST NOT leak.
      assignment_reasoning: {
        kind: 'math_only',
        mathScore: 0.88,
        mathBreakdown: {
          skillOverlap: 1,
          fitForKind: 1,
          availabilityNow: 1,
          loadHeadroom: 0.5,
          interestNudge: 0,
        },
        whyYouSentence: 'SHOULD NOT APPEAR',
      },
      triage_note: null,
    },
  ];

  const builder: Record<string, unknown> = {};
  const passThrough = () => builder;
  builder.select = vi.fn(passThrough);
  builder.eq = vi.fn(passThrough);
  builder.in = vi.fn(passThrough);
  builder.gte = vi.fn(passThrough);
  builder.lte = vi.fn(passThrough);
  builder.limit = vi.fn(passThrough);
  builder.order = vi.fn(passThrough);
  builder.not = vi.fn(passThrough);
  builder.is = vi.fn(passThrough);
  builder.gt = vi.fn(passThrough);
  // thenable: `await builder` resolves to the row payload.
  builder.then = (resolve: (val: unknown) => void) => {
    resolve({ data: rowsPayload, error: null });
  };

  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

describe('storage.listAssignedTasksInWindow — privacy invariants', () => {
  it('omits assignmentReasoning from rows even when DB row has assignment_reasoning JSONB populated', async () => {
    const { listAssignedTasksInWindow } = await import('@/lib/recgon/storage');
    const result = await listAssignedTasksInWindow('team-1', '2026-05-18', '2026-05-31');

    expect(result).toHaveLength(1);
    const row = result[0];
    expect('assignmentReasoning' in row).toBe(false);
    expect(row.id).toBe('task-in-window');
    expect(row.scheduledDate).toBe('2026-05-18');
    expect(row.title).toBe('In-window task');
    // Defensive: also confirm no whyYouSentence stowaway.
    expect('whyYouSentence' in row).toBe(false);
  });
});
