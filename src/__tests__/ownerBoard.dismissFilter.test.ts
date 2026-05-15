// Phase 3.5 / Plan 03.5-03 — storage filter contract for the owner-dock
// dismissal feature (Test 9 from Plan 03.5-03 Task 1).
//
// Validates that `listOwnerDockTasks(teamId, viewerUserId)` filters out
// deferred task ids that the viewer has dismissed, while leaving the triaged
// bucket and other viewers untouched.
//
// We mock the underlying supabase client via vi.doMock + dynamic import so
// the queries route through fake chainable thenables. Each test uses an
// isolated `state` object captured per `mountSupabase` call.

import { describe, expect, it, vi, beforeEach } from 'vitest';

type RowSet = unknown[];

// Build a thenable that resolves to { data, error } when awaited at ANY point
// after a .select(). Supabase Postgrest queries are thenables: every chain
// method (.eq, .is, .not, .order, .limit, etc.) returns the same thenable,
// and resolution happens when something `await`s it. Our mock mirrors that.
function chain(resolveData: RowSet) {
  const resolvePromise = Promise.resolve({ data: resolveData, error: null });
  const passthrough: Record<string, unknown> = {};
  const self = passthrough as unknown as {
    select: (...args: unknown[]) => typeof self;
    eq: (...args: unknown[]) => typeof self;
    is: (...args: unknown[]) => typeof self;
    not: (...args: unknown[]) => typeof self;
    gt: (...args: unknown[]) => typeof self;
    order: (...args: unknown[]) => typeof self;
    limit: (...args: unknown[]) => typeof self;
    then: (onFulfilled?: (v: { data: RowSet; error: null }) => unknown) => Promise<unknown>;
  };
  passthrough.select = () => self;
  passthrough.eq = () => self;
  passthrough.is = () => self;
  passthrough.not = () => self;
  passthrough.gt = () => self;
  passthrough.order = () => self;
  passthrough.limit = () => self;
  passthrough.then = (onFulfilled) => resolvePromise.then(onFulfilled);
  return self;
}

const teamId = 'team-1';

const baseRow = {
  id: 'task-a',
  team_id: teamId,
  project_id: null,
  title: 'Task A',
  description: '',
  kind: 'next_step',
  source: 'brain',
  source_ref: {},
  required_skills: [],
  priority: 1,
  estimated_hours: 1,
  deadline: null,
  assigned_to: null,
  assigned_by: null,
  assigned_at: null,
  status: 'unassigned',
  job_id: null,
  result: null,
  created_by: null,
  created_at: '2026-05-15T00:00:00.000Z',
  completed_at: null,
  proof: null,
  verification_status: null,
  verification_evidence: null,
  verified_at: null,
  verified_by: null,
  scheduled_date: '2026-05-22',
  scheduled_until_date: null,
  schedule_note: null,
  reschedule_request_status: null,
  reschedule_requested_at: null,
  reschedule_requested_by: null,
  reschedule_request_note: null,
  reschedule_requested_date: null,
  assignment_reasoning: null,
  triage_note: null,
};

const taskARow = { ...baseRow, id: 'task-a', title: 'Task A' };
const taskBRow = { ...baseRow, id: 'task-b', title: 'Task B' };

beforeEach(() => {
  vi.resetModules();
});

interface MountResult {
  dismissalsQueried: boolean;
}

/**
 * Mount a supabase mock. Each call captures its own state in a closure object
 * so parallel/repeat invocations don't interfere.
 *
 * Triaged query is intentionally empty so we focus on deferred filtering.
 */
function mountSupabase(opts: { deferredRows: RowSet; dismissedRows: RowSet }): MountResult {
  const state = {
    agentTaskCallCount: 0,
    dismissalsQueried: false,
  };

  vi.doMock('@/lib/supabase', () => ({
    supabase: {
      from: (table: string) => {
        if (table === 'agent_tasks') {
          state.agentTaskCallCount += 1;
          if (state.agentTaskCallCount === 1) {
            return chain([]); // triaged
          }
          return chain(opts.deferredRows); // deferred
        }
        if (table === 'owner_dock_dismissals') {
          state.dismissalsQueried = true;
          return chain(opts.dismissedRows);
        }
        return chain([]);
      },
    },
  }));

  return state;
}

describe('listOwnerDockTasks(teamId, viewerUserId) — per-user deferred filter (D-17)', () => {
  it('Test 9a: user U1 has dismissed taskA → deferred returns [taskB] only', async () => {
    mountSupabase({
      deferredRows: [taskARow, taskBRow],
      dismissedRows: [{ task_id: 'task-a' }],
    });

    const { listOwnerDockTasks } = await import('@/lib/recgon/storage');
    const result = await listOwnerDockTasks(teamId, 'user-u1');
    expect(result.deferred.map((t) => t.id)).toEqual(['task-b']);
    expect(result.triaged).toEqual([]);
  });

  it('Test 9b: user U2 has no dismissals → deferred returns [taskA, taskB]', async () => {
    mountSupabase({
      deferredRows: [taskARow, taskBRow],
      dismissedRows: [],
    });

    const { listOwnerDockTasks } = await import('@/lib/recgon/storage');
    const result = await listOwnerDockTasks(teamId, 'user-u2');
    expect(result.deferred.map((t) => t.id).sort()).toEqual(['task-a', 'task-b']);
  });

  it('Test 9c: no viewerUserId passed → deferred returns all rows (no dismissals query fired)', async () => {
    const state = mountSupabase({
      deferredRows: [taskARow, taskBRow],
      dismissedRows: [],
    });

    const { listOwnerDockTasks } = await import('@/lib/recgon/storage');
    const result = await listOwnerDockTasks(teamId);
    expect(result.deferred.map((t) => t.id).sort()).toEqual(['task-a', 'task-b']);
    expect(state.dismissalsQueried).toBe(false);
  });

  it('Test 9d: dismissals exist but for taskB — viewer-u1 sees [taskA] only', async () => {
    mountSupabase({
      deferredRows: [taskARow, taskBRow],
      dismissedRows: [{ task_id: 'task-b' }],
    });

    const { listOwnerDockTasks } = await import('@/lib/recgon/storage');
    const result = await listOwnerDockTasks(teamId, 'user-u1');
    expect(result.deferred.map((t) => t.id)).toEqual(['task-a']);
  });
});
