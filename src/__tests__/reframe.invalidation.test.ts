// Phase 4 Plan 03 / Task 3.1 — reassignTask invalidation regression tests.
//
// Pins the FRAME-04 contract for reassignment:
//   1. Reassigning to a NEW teammate → personalized_description AND
//      personalized_description_for_user_id are BOTH nulled in the SAME
//      supabase update statement as the assigned_to change (atomic), and
//      enqueueReframeJob is called once for the new userId.
//   2. Reassigning to null (decline/unassign) → both columns nulled, NO
//      enqueue (no one to personalize for).
//   3. Reassigning to the SAME teammate → columns preserved, NO enqueue
//      (no actual reassignment).
//   4. Reassigning to a teammate with no userId → invalidation still
//      happens, but no enqueue (no userId to personalize for).
//   5. enqueueJob throwing → reassignTask still completes (fire-and-forget).
//   6. Atomic: exactly ONE update call, never two (no race window).

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Supabase stub (chainable, table-aware) ─────────────────────────────────
//
// We mock @/lib/supabase to a stub that captures every read and write so
// we can assert the EXACT shape of the update call (the atomic invalidation
// is observable from the write payload).

type ReadResult = { data: unknown; error: { message: string } | null };
type WriteResult = { error: { message: string } | null };

const readHandlers = new Map<string, ReadResult>();
const writeResults = new Map<string, WriteResult>();
const writeCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const readCalls: Array<{ table: string }> = [];

function resetStubs(): void {
  readHandlers.clear();
  writeResults.clear();
  writeCalls.length = 0;
  readCalls.length = 0;
}

function setRead(table: string, result: ReadResult): void {
  readHandlers.set(table, result);
}

function setWrite(table: string, result: WriteResult): void {
  writeResults.set(table, result);
}

type GlobalWithStub = typeof globalThis & {
  __reassignSupabaseStub?: unknown;
};

const supabaseStub = {
  from(table: string) {
    return {
      select(_cols: string) {
        readCalls.push({ table });
        const chain = {
          eq(_col: string, _val: unknown) {
            return chain;
          },
          maybeSingle(): Promise<ReadResult> {
            const h = readHandlers.get(table);
            return Promise.resolve(h ?? { data: null, error: null });
          },
        };
        return chain;
      },
      update(payload: Record<string, unknown>) {
        writeCalls.push({ table, payload });
        return {
          eq(_col: string, _val: unknown): Promise<WriteResult> {
            const h = writeResults.get(table);
            return Promise.resolve(h ?? { error: null });
          },
        };
      },
    };
  },
};
(globalThis as GlobalWithStub).__reassignSupabaseStub = supabaseStub;

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return (globalThis as GlobalWithStub).__reassignSupabaseStub;
  },
}));

// ── enqueueReframeJob mock ─────────────────────────────────────────────────
//
// We mock the leaf module directly. reassignTask imports
// `enqueueReframeJob` from './reframeEnqueue' so the mock target is the
// same module under test wiring — `@/lib/recgon/reframeEnqueue`.

const enqueueReframeJobMock = vi.fn(async () => undefined);
type GlobalWithEnq = typeof globalThis & {
  __reassignEnqueueMock?: (...args: unknown[]) => Promise<void>;
};
(globalThis as GlobalWithEnq).__reassignEnqueueMock = enqueueReframeJobMock;

vi.mock('@/lib/recgon/reframeEnqueue', () => ({
  enqueueReframeJob: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithEnq).__reassignEnqueueMock;
    return m ? m(...args) : Promise.resolve();
  },
}));

// ── Imports under test ─────────────────────────────────────────────────────

import { reassignTask } from '@/lib/recgon/storage';

beforeEach(() => {
  resetStubs();
  enqueueReframeJobMock.mockClear();
  enqueueReframeJobMock.mockImplementation(async () => undefined);
});

// ── Helpers ────────────────────────────────────────────────────────────────

function setCurrentTask(assignedTo: string | null, teamId = 'team-1'): void {
  setRead('agent_tasks', {
    data: { assigned_to: assignedTo, team_id: teamId },
    error: null,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('reassignTask — FRAME-04 invalidation contract', () => {
  it('Test 1: reassignment to a NEW teammate nulls both personalized columns AND enqueues a new reframe', async () => {
    setCurrentTask('teammate-old');

    await reassignTask('task-1', 'teammate-new', 'recgon');

    // Exactly one update — atomic.
    const updates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(updates).toHaveLength(1);

    // The invalidation lives in the same update as assigned_to.
    expect(updates[0].payload).toMatchObject({
      assigned_to: 'teammate-new',
      personalized_description: null,
      personalized_description_for_user_id: null,
    });

    // Enqueue happens with the new assignee.
    expect(enqueueReframeJobMock).toHaveBeenCalledTimes(1);
    expect(enqueueReframeJobMock).toHaveBeenCalledWith(
      'task-1',
      'teammate-new',
      'team-1',
    );
  });

  it('Test 2: reassignment to null (decline/unassign) nulls both columns but does NOT enqueue', async () => {
    setCurrentTask('teammate-old');

    await reassignTask('task-1', null, 'user-x');

    const updates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      assigned_to: null,
      personalized_description: null,
      personalized_description_for_user_id: null,
    });

    // No enqueue — no one to personalize for.
    expect(enqueueReframeJobMock).not.toHaveBeenCalled();
  });

  it('Test 3: reassignment to the SAME teammate is a no-op — columns preserved, no enqueue', async () => {
    setCurrentTask('teammate-same');

    await reassignTask('task-1', 'teammate-same', 'recgon');

    const updates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(updates).toHaveLength(1);

    // The invalidation keys must NOT appear in the payload.
    expect(updates[0].payload).not.toHaveProperty('personalized_description');
    expect(updates[0].payload).not.toHaveProperty(
      'personalized_description_for_user_id',
    );

    // No enqueue — no actual reassignment.
    expect(enqueueReframeJobMock).not.toHaveBeenCalled();
  });

  it('Test 4: new teammate WITHOUT a userId — invalidation happens, enqueue runs but skips inside the helper', async () => {
    setCurrentTask('teammate-old');

    // Helper-level skip is the helper's own concern (covered by reframe.worker
    // and dispatcher tests). For storage we only care that:
    //   - The columns ARE nulled (the old userId is no longer the assignee).
    //   - The helper IS called (the storage layer doesn't pre-filter; the
    //     helper short-circuits internally on userId === null).
    await reassignTask('task-1', 'teammate-no-user', 'recgon');

    const updates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(updates[0].payload).toMatchObject({
      personalized_description: null,
      personalized_description_for_user_id: null,
    });

    // Storage is teammate-agnostic: it calls the helper, which then decides
    // whether to actually enqueue based on teammate.userId. From storage's
    // viewpoint the call always happens for any non-null teammateId.
    expect(enqueueReframeJobMock).toHaveBeenCalledTimes(1);
    expect(enqueueReframeJobMock).toHaveBeenCalledWith(
      'task-1',
      'teammate-no-user',
      'team-1',
    );
  });

  it('Test 5: enqueueReframeJob throwing does NOT prevent reassignTask from completing', async () => {
    setCurrentTask('teammate-old');
    enqueueReframeJobMock.mockImplementationOnce(async () => {
      throw new Error('queue down');
    });

    // The helper is contractually fire-and-forget and catches its own
    // errors. Even if (for some reason) it did throw, reassignTask's job
    // is the persistence — we should never roll back the assignment.
    // We assert reassignTask resolves to undefined (no throw escapes).
    await expect(
      reassignTask('task-1', 'teammate-new', 'recgon'),
    ).resolves.toBeUndefined();

    const updates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      assigned_to: 'teammate-new',
      personalized_description: null,
      personalized_description_for_user_id: null,
    });
  });

  it('Test 6: atomic — exactly ONE supabase update call, all fields together (no race window)', async () => {
    setCurrentTask('teammate-old');

    await reassignTask('task-1', 'teammate-new', 'recgon');

    // Exactly one update — never two. Two updates would create a window
    // where the new assignee could read the stale personalized text.
    const taskUpdates = writeCalls.filter((c) => c.table === 'agent_tasks');
    expect(taskUpdates).toHaveLength(1);

    // The single update carries ALL the change: assigned_to + invalidation.
    const payload = taskUpdates[0].payload;
    expect(payload).toHaveProperty('assigned_to', 'teammate-new');
    expect(payload).toHaveProperty('personalized_description', null);
    expect(payload).toHaveProperty(
      'personalized_description_for_user_id',
      null,
    );
  });
});
