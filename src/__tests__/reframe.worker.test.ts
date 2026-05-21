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

// WR-02: errors now expose an optional `code` field (Postgres error codes
// — Supabase forwards them via PostgrestError.code). 42703 is the canonical
// "undefined column" signal the worker checks first.
type StubError = { message: string; code?: string } | null;
type StubMaybeSingle = () => Promise<{ data: unknown; error: StubError }>;
type StubListResult = Promise<{ data: unknown; error: StubError }>;
type StubUpdateResult = Promise<{ error: StubError }>;

type ReadHandler =
  | { kind: 'single'; result: { data: unknown; error: StubError } }
  | { kind: 'list'; result: { data: unknown; error: StubError } };

type WriteHandler = {
  result: { error: StubError };
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

const getProfileMock = vi.fn(async () => ({
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
}));
(globalThis as GlobalWithStub & {
  __reframeWorkerGetProfileMock?: unknown;
}).__reframeWorkerGetProfileMock = getProfileMock;
vi.mock('@/lib/recgon/profileStorage', () => ({
  getProfile: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerGetProfileMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerGetProfileMock;
    return m ? m(...args) : Promise.resolve(null);
  },
}));

// FRAME-05 follow-up: the worker now owns the assignment email. Mock the
// notifications module + the storage helpers that sendAssignmentEmail uses
// to reload fresh state (getTask / getTeammate / getTeam). Each mock is
// attached to globalThis so per-test reconfiguration survives vi.resetAllMocks.

const notifyMock = vi.fn(async (_args: unknown) => undefined);
(globalThis as GlobalWithStub & {
  __reframeWorkerNotifyMock?: unknown;
}).__reframeWorkerNotifyMock = notifyMock;
vi.mock('@/lib/notifications', () => ({
  notifyTeammateAssigned: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerNotifyMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerNotifyMock;
    return m ? m(...args) : Promise.resolve(undefined);
  },
}));

const getTaskMock = vi.fn(async () => null as unknown);
const getTeammateMock = vi.fn(async () => null as unknown);
(globalThis as GlobalWithStub & {
  __reframeWorkerGetTaskMock?: unknown;
  __reframeWorkerGetTeammateMock?: unknown;
}).__reframeWorkerGetTaskMock = getTaskMock;
(globalThis as GlobalWithStub & {
  __reframeWorkerGetTeammateMock?: unknown;
}).__reframeWorkerGetTeammateMock = getTeammateMock;
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerGetTaskMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerGetTaskMock;
    return m ? m(...args) : Promise.resolve(null);
  },
  getTeammate: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerGetTeammateMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerGetTeammateMock;
    return m ? m(...args) : Promise.resolve(null);
  },
}));

const getTeamMock = vi.fn(async () => null as unknown);
(globalThis as GlobalWithStub & {
  __reframeWorkerGetTeamMock?: unknown;
}).__reframeWorkerGetTeamMock = getTeamMock;
vi.mock('@/lib/teamStorage', () => ({
  getTeam: (...args: unknown[]) => {
    const m = (globalThis as GlobalWithStub & {
      __reframeWorkerGetTeamMock?: (...a: unknown[]) => unknown;
    }).__reframeWorkerGetTeamMock;
    return m ? m(...args) : Promise.resolve(null);
  },
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

// Reusable fixture for sendAssignmentEmail's fresh-reload path: returns a
// task/teammate/team that look like the canonical assigned shape.
function setEmailReloadHappyPath(opts: { description?: string; personalized?: string | null } = {}): void {
  getTaskMock.mockResolvedValue({
    id: 'task-1',
    teamId: 'team-1',
    assignedTo: 'teammate-1',
    title: 'Wire login endpoint to Supabase',
    description: opts.description ?? 'Add the new POST /api/auth/login route to src/lib/auth.ts',
    personalizedDescription: opts.personalized ?? null,
    personalizedDescriptionForUserId: opts.personalized ? 'user-1' : null,
    assignmentReasoning: null,
  } as unknown);
  getTeammateMock.mockResolvedValue({
    id: 'teammate-1',
    teamId: 'team-1',
    userId: 'user-1',
    displayName: 'Alex',
  } as unknown);
  getTeamMock.mockResolvedValue({ id: 'team-1', name: 'Recgon Test Team' } as unknown);
}

beforeEach(() => {
  resetSupabaseStub();
  runReframeMock.mockClear();
  notifyMock.mockClear();
  getTaskMock.mockReset();
  getTeammateMock.mockReset();
  getTeamMock.mockReset();
  getProfileMock.mockClear();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runTaskReframe — happy path', () => {
  it('writes personalized_description + personalized_description_for_user_id to agent_tasks AND sends email with personalized text (FRAME-05)', async () => {
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
    // After the worker writes personalized_description, sendAssignmentEmail
    // reloads fresh task state — that reload returns the personalized text.
    setEmailReloadHappyPath({
      personalized:
        'Your typescript background fits this one — start at src/lib/auth.ts to wire the login endpoint cleanly.',
    });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ success: true, taskId: 'task-1' });
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0].table).toBe('agent_tasks');
    expect(writeCalls[0].payload).toMatchObject({
      personalized_description: expect.stringContaining('typescript'),
      personalized_description_for_user_id: 'user-1',
    });
    expect(runReframeMock).toHaveBeenCalledTimes(1);
    // FRAME-05: the worker MUST send the assignment email with the
    // personalized text loaded from fresh state (not from the job payload).
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as unknown as {
      task: { personalizedDescription: string | null };
      teamName: string;
    };
    expect(notifyArgs.task.personalizedDescription).toContain('typescript');
    expect(notifyArgs.teamName).toBe('Recgon Test Team');
  });
});

describe('runTaskReframe — columns_missing fail-soft', () => {
  // WR-02: detection uses Postgres error code 42703 first, with substring
  // fallback. Fixture mocks both so the test pins the canonical signal AND
  // remains compatible with the legacy substring path.
  it('returns { skipped: true, reason: "columns_missing" } when supabase reports column does not exist (code 42703 + message)', async () => {
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
          code: '42703',
          message:
            'column "personalized_description" of relation "agent_tasks" does not exist',
        },
      },
    });
    // FRAME-05: columns_missing is a fail-soft path — the assignee still
    // needs to be told about the assignment. Email goes out with the
    // ORIGINAL description (personalizedDescription is null in the reload).
    setEmailReloadHappyPath({ personalized: null });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'columns_missing' });
    // The update was attempted (we want to verify it actually tried the write
    // path; columns_missing is detected from the response, not pre-checked).
    expect(writeCalls).toHaveLength(1);
    // Email IS sent in the columns_missing fail-soft path.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as unknown as {
      task: { personalizedDescription: string | null };
    };
    expect(notifyArgs.task.personalizedDescription).toBeNull();
  });

  // WR-02: a future Postgres release (or locale change) might rewrite the
  // "column ... does not exist" string. The canonical 42703 code must
  // still trigger fail-soft even if the message no longer matches.
  it('returns { skipped: true, reason: "columns_missing" } when error code is 42703 even if message text does not match', async () => {
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
          code: '42703',
          // Intentionally a non-matching message — e.g. a localized or
          // future-rewritten Postgres error string. Substring fallback
          // would NOT catch this; only the 42703 code does.
          message: 'attribut "personalized_description" introuvable',
        },
      },
    });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'columns_missing' });
    expect(writeCalls).toHaveLength(1);
  });
});

describe('runTaskReframe — reassignment race shield', () => {
  it('returns { skipped: true, reason: "reassigned" } AND does NOT send email (the new reframe job for the new assignee will send)', async () => {
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
    // FRAME-05: NO email sent. The new reframe job (enqueued by
    // reassignTask) sends the new assignee's email — sending here would
    // notify the previous assignee about a task they no longer own.
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

// FRAME-05 follow-up: thin profile + final-attempt fallback + mid-retry behavior.

describe('runTaskReframe — thin profile guard (Fix 3)', () => {
  it('skips LLM call and sends email with original description when assignee has zero declared signals', async () => {
    // Profile with NO skills, NO interests, AND no project_id → no recent
    // task titles → signalCount === 0.
    getProfileMock.mockResolvedValueOnce({
      id: 'profile-empty',
      teamId: 'team-1',
      userId: 'user-1',
      skillsRaw: [],
      strengthsRaw: [],
      interestsRaw: [],
      skillsCanonical: [],
      strengthsCanonical: [],
      interestsCanonical: [],
      weeklyCapacityHours: 10,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      githubMiningConsentAt: null,
      lastScanAt: null,
    });
    setRead('agent_tasks', {
      kind: 'single',
      result: {
        data: {
          id: 'task-1',
          team_id: 'team-1',
          project_id: null, // no project → no recentTaskTitles fetch
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
    setEmailReloadHappyPath({ personalized: null });

    const result = await runTaskReframe(makeJob());

    expect(result).toMatchObject({ skipped: true, reason: 'thin_profile' });
    // LLM was NOT called — that's the whole point of the guard.
    expect(runReframeMock).not.toHaveBeenCalled();
    // No DB write either.
    expect(writeCalls).toHaveLength(0);
    // Email IS sent with the original description.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as unknown as {
      task: { personalizedDescription: string | null };
    };
    expect(notifyArgs.task.personalizedDescription).toBeNull();
  });
});

describe('runTaskReframe — final-attempt fallback (FRAME-05)', () => {
  it('catches LLM failure on FINAL attempt + sends email with original + returns skipped:reframe_failed_all_retries', async () => {
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
    // Pretend the LLM rejected (e.g. tone_reject) on every attempt.
    runReframeMock.mockRejectedValueOnce(
      Object.assign(new Error('tone_reject'), { kind: 'tone_reject' }),
    );
    setEmailReloadHappyPath({ personalized: null });

    // Final attempt: attempts === max_attempts - 1 (e.g. 4 of 5).
    const job = makeJob();
    job.attempts = job.max_attempts - 1;

    const result = await runTaskReframe(job);

    expect(result).toMatchObject({ skipped: true, reason: 'reframe_failed_all_retries' });
    // Email IS sent with the original description as a final fallback.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const notifyArgs = notifyMock.mock.calls[0]?.[0] as unknown as {
      task: { personalizedDescription: string | null };
    };
    expect(notifyArgs.task.personalizedDescription).toBeNull();
    // No DB write — runReframe never returned a sentence.
    expect(writeCalls).toHaveLength(0);
  });

  it('mid-retry failure: LLM throws, NOT final attempt → re-throws AND does NOT send email', async () => {
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
    runReframeMock.mockRejectedValueOnce(
      Object.assign(new Error('schema_reject'), { kind: 'schema_reject' }),
    );

    // Mid-retry: attempts well below max_attempts - 1.
    const job = makeJob();
    job.attempts = 0;

    await expect(runTaskReframe(job)).rejects.toThrow();
    // No email sent — the queue will retry, and the next attempt may succeed
    // and send the personalized email itself.
    expect(notifyMock).not.toHaveBeenCalled();
    expect(writeCalls).toHaveLength(0);
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
