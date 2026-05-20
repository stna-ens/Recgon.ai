// Phase 4 Plan 01 — task_reframe worker integration tests.
//
// Exercises `runTaskReframe(job)` from `src/lib/llm/workers.ts` with the
// supabase client + the pure `runReframe` module fully mocked. Covers the
// happy path (writes both columns), the columns_missing fail-soft, and the
// reassignment race shield.
//
// We mock `@/lib/supabase` to a chainable stub so the worker's
// `.from(...).select(...).maybeSingle()` / `.update(...).eq(...)` calls
// resolve against fixture data without hitting Postgres. We mock
// `@/lib/recgon/profileStorage.getProfile` to return a canned profile,
// and we mock `@/lib/recgon/reframe.runReframe` to return a canned result.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Supabase stub builder ───────────────────────────────────────────────────
//
// The worker calls supabase in two distinct shapes:
//   A. `.from(table).select(...).eq(...).maybeSingle()` — single row reads.
//   B. `.from(table).select(...).eq(...).order(...).limit(...)` — list reads.
//   C. `.from(table).update(...).eq(...)` — writes.
//
// We register a per-table handler so each call returns the right canned
// payload. Calls are also recorded so tests can assert what the worker did.

type StubMaybeSingle = () => Promise<{ data: unknown; error: { message: string } | null }>;
type StubListResult = Promise<{ data: unknown; error: { message: string } | null }>;
type StubUpdateResult = Promise<{ error: { message: string } | null }>;

type ReadHandler =
  | { kind: 'single'; result: { data: unknown; error: { message: string } | null } }
  | { kind: 'list'; result: { data: unknown; error: { message: string } | null } };

type WriteHandler = {
  result: { error: { message: string } | null };
};

const readHandlers = new Map<string, ReadHandler>();
const writeHandlers = new Map<string, WriteHandler>();
const writeCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const readCalls: Array<{ table: string }> = [];

function resetSupabaseStub(): void {
  readHandlers.clear();
  writeHandlers.clear();
  writeCalls.length = 0;
  readCalls.length = 0;
}

function setRead(table: string, handler: ReadHandler): void {
  readHandlers.set(table, handler);
}

function setWrite(table: string, handler: WriteHandler): void {
  writeHandlers.set(table, handler);
}

// Note: vi.mock factories are hoisted above all imports/consts, so we cannot
// close over `readHandlers`/`writeCalls` directly. Instead, we attach the
// supabase stub onto `globalThis` and reference it from inside the factory.
type GlobalWithStub = typeof globalThis & {
  __reframeWorkerSupabaseStub?: unknown;
};

const supabaseStub = {
  from(table: string) {
    return {
      select(_cols: string) {
        readCalls.push({ table });
        const _readChain = {
          eq(_col: string, _val: unknown) {
            return _readChain;
          },
          order(_col: string, _opts?: unknown) {
            return _readChain;
          },
          limit(_n: number): StubListResult {
            const h = readHandlers.get(table);
            if (h && h.kind === 'list') return Promise.resolve(h.result);
            return Promise.resolve({ data: [], error: null });
          },
          maybeSingle(): ReturnType<StubMaybeSingle> {
            const h = readHandlers.get(table);
            if (h && h.kind === 'single') return Promise.resolve(h.result);
            return Promise.resolve({ data: null, error: null });
          },
        };
        return _readChain;
      },
      update(payload: Record<string, unknown>) {
        writeCalls.push({ table, payload });
        return {
          eq(_col: string, _val: unknown): StubUpdateResult {
            const h = writeHandlers.get(table);
            if (h) return Promise.resolve(h.result);
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  },
};
(globalThis as GlobalWithStub).__reframeWorkerSupabaseStub = supabaseStub;

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return (globalThis as GlobalWithStub).__reframeWorkerSupabaseStub;
  },
}));

// ── Mocks for getProfile + runReframe ───────────────────────────────────────

vi.mock('@/lib/recgon/profileStorage', () => ({
  getProfile: vi.fn(async () => ({
    id: 'profile-1',
    teamId: 'team-1',
    userId: 'user-1',
    skillsRaw: ['typescript'],
    strengthsRaw: [],
    interestsRaw: [],
    skillsCanonical: ['typescript', 'supabase'],
    strengthsCanonical: [],
    interestsCanonical: ['developer experience'],
    weeklyCapacityHours: 10,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    githubMiningConsentAt: null,
    lastScanAt: null,
  })),
}));

const runReframeMock = vi.fn(async () => ({
  sentence:
    'Your typescript background fits this one — start at src/lib/auth.ts to wire the login endpoint cleanly.',
  citedMoves: ['fit_acknowledgement', 'start_location'] as const,
  citedSignals: ['typescript', 'src/lib/auth.ts'],
}));
(globalThis as GlobalWithStub & {
  __reframeWorkerRunReframeMock?: unknown;
}).__reframeWorkerRunReframeMock = runReframeMock;

vi.mock('@/lib/recgon/reframe', () => ({
  runReframe: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerRunReframeMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerRunReframeMock;
    return m ? m(...args) : Promise.reject(new Error('runReframe mock missing'));
  },
}));

// ── Imports under test ──────────────────────────────────────────────────────

import { runTaskReframe } from '@/lib/llm/workers';
import type { LLMJob } from '@/lib/llm/jobQueue';

function makeJob(): LLMJob {
  return {
    id: 'job-1',
    team_id: 'team-1',
    user_id: 'user-1',
    kind: 'task_reframe',
    payload: {
      taskId: 'task-1',
      assigneeUserId: 'user-1',
      teamId: 'team-1',
    },
    status: 'running',
    result: null,
    error: null,
    attempts: 1,
    max_attempts: 5,
    next_retry_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    locked_by: 'cron',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  resetSupabaseStub();
  runReframeMock.mockClear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runTaskReframe — happy path', () => {
  it('writes personalized_description + personalized_description_for_user_id to agent_tasks', async () => {
    setRead('agent_tasks', {
      kind: 'single',
      result: {
        data: {
          id: 'task-1',
          team_id: 'team-1',
          project_id: 'proj-1',
          title: 'Wire login endpoint to Supabase',
          description: 'Add the new POST /api/auth/login route to src/lib/auth.ts',
          kind: 'dev_prompt',
          assigned_to: 'teammate-1',
          assignment_reasoning: null,
        },
        error: null,
      },
    });
    setRead('teammates', {
      kind: 'single',
      result: {
        data: { id: 'teammate-1', user_id: 'user-1', status: 'active' },
        error: null,
      },
    });
    setWrite('agent_tasks', { result: { error: null } });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ success: true, taskId: 'task-1' });
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].table).toBe('agent_tasks');
    expect(writeCalls[0].payload).toMatchObject({
      personalized_description: expect.stringContaining('typescript'),
      personalized_description_for_user_id: 'user-1',
    });
    expect(runReframeMock).toHaveBeenCalledTimes(1);
  });
});

describe('runTaskReframe — columns_missing fail-soft', () => {
  it('returns { skipped: true, reason: "columns_missing" } when supabase reports column does not exist', async () => {
    setRead('agent_tasks', {
      kind: 'single',
      result: {
        data: {
          id: 'task-1',
          team_id: 'team-1',
          project_id: 'proj-1',
          title: 'Wire login endpoint to Supabase',
          description: 'Add the new POST /api/auth/login route to src/lib/auth.ts',
          kind: 'dev_prompt',
          assigned_to: 'teammate-1',
          assignment_reasoning: null,
        },
        error: null,
      },
    });
    setRead('teammates', {
      kind: 'single',
      result: {
        data: { id: 'teammate-1', user_id: 'user-1', status: 'active' },
        error: null,
      },
    });
    setWrite('agent_tasks', {
      result: {
        error: {
          message:
            'column "personalized_description" of relation "agent_tasks" does not exist',
        },
      },
    });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'columns_missing' });
    // The update was attempted (we want to verify it actually tried the write
    // path; columns_missing is detected from the response, not pre-checked).
    expect(writeCalls).toHaveLength(1);
  });
});

describe('runTaskReframe — reassignment race shield', () => {
  it('returns { skipped: true, reason: "reassigned" } when current assignee_user_id differs from payload', async () => {
    setRead('agent_tasks', {
      kind: 'single',
      result: {
        data: {
          id: 'task-1',
          team_id: 'team-1',
          project_id: 'proj-1',
          title: 'Wire login endpoint to Supabase',
          description: 'Add the new POST /api/auth/login route to src/lib/auth.ts',
          kind: 'dev_prompt',
          assigned_to: 'teammate-2', // different teammate now
          assignment_reasoning: null,
        },
        error: null,
      },
    });
    setRead('teammates', {
      kind: 'single',
      result: {
        data: { id: 'teammate-2', user_id: 'user-other', status: 'active' },
        error: null,
      },
    });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'reassigned' });
    // No write happened — race shield short-circuits before runReframe.
    expect(writeCalls).toHaveLength(0);
    expect(runReframeMock).not.toHaveBeenCalled();
  });
});

describe('runTaskReframe — no_assignee', () => {
  it('returns { skipped: true, reason: "no_assignee" } when task has no assigned_to', async () => {
    setRead('agent_tasks', {
      kind: 'single',
      result: {
        data: {
          id: 'task-1',
          team_id: 'team-1',
          project_id: 'proj-1',
          title: 'Wire login endpoint to Supabase',
          description: 'Add the new POST /api/auth/login route to src/lib/auth.ts',
          kind: 'dev_prompt',
          assigned_to: null,
          assignment_reasoning: null,
        },
        error: null,
      },
    });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'no_assignee' });
    expect(writeCalls).toHaveLength(0);
  });
});
