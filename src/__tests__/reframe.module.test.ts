// Phase 4 Plan 01 — reframe.ts unit tests.
//
// RED scaffold for the pure `runReframe` function. Covers:
//   - happy path → returns parsed ReframeResult.
//   - schema reject → throws ReframeError kind='schema_reject'.
//   - grounding reject (cites skill NOT in declaredSkills) → kind='grounding_reject' (FRAME-07).
//   - tone reject (flattery keyword) → kind='tone_reject' (FRAME-06).
//   - tone reject (pronoun via PRONOUN_DENY) → kind='tone_reject'.
//   - empty assignee profile + cited signal → kind='grounding_reject'.
//   - LLM throws → kind='llm_failure'.
//   - adapter injection → custom opts.chat is invoked (no chatViaProviders).
//
// Tests inject a stubbed `chat` adapter so we never hit a real LLM.

import { describe, expect, it, vi } from 'vitest';

import {
  runReframe,
  ReframeError,
  type ReframeInputs,
} from '@/lib/recgon/reframe';

// ── Chat stub helper ────────────────────────────────────────────────────────

function makeChatStub(canned: string) {
  const calls: Array<{ system: string; user: string }> = [];
  const stub = async (system: string, user: string): Promise<string> => {
    calls.push({ system, user });
    return canned;
  };
  return { stub, calls };
}

function makeThrowingChat(message = 'gemini failed') {
  const calls: Array<{ system: string; user: string }> = [];
  const stub = async (system: string, user: string): Promise<string> => {
    calls.push({ system, user });
    throw new Error(message);
  };
  return { stub, calls };
}

// ── Test inputs ─────────────────────────────────────────────────────────────

const baseInputs: ReframeInputs = {
  task: {
    id: 'task-1',
    title: 'Wire login endpoint to Supabase',
    description: 'Add the new POST /api/auth/login route to src/lib/auth.ts',
    kind: 'dev_prompt',
  },
  assignee: {
    userId: 'user-1',
    declaredSkills: ['typescript', 'supabase'],
    declaredInterests: ['developer experience'],
  },
  assignmentReasoning: {
    kind: 'llm_tiebreaker',
    mathScore: 0.72,
    mathBreakdown: {
      skillOverlap: 0.6,
      fitForKind: 0.7,
      availabilityNow: 0.8,
      loadHeadroom: 0.5,
      interestNudge: 0.1,
    },
    judge: {
      task_id: 'task-1',
      chosen_candidate_id: 1,
      reason_code: 'skill_depth',
      reason_sentence: 'you have deep typescript and supabase experience.',
      confidence: 'high',
    },
  },
  recentProjectState: {
    recentCommitFiles: ['src/lib/auth.ts', 'src/middleware.ts'],
    recentAnalyticsChange: 'login_signups_up_12pct',
    recentTaskTitles: ['Wire register endpoint', 'Add NextAuth callback'],
  },
};

function happyResponseJson(): string {
  return JSON.stringify({
    sentence:
      'Your typescript background fits this one — start at src/lib/auth.ts and reuse the supabase client wired in the recent login refactor.',
    cited_moves: ['fit_acknowledgement', 'start_location'],
    cited_signals: ['typescript', 'src/lib/auth.ts'],
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runReframe — happy path', () => {
  it('returns parsed ReframeResult on valid JSON', async () => {
    const { stub } = makeChatStub(happyResponseJson());
    const result = await runReframe(baseInputs, { chat: stub });
    expect(result.sentence.length).toBeGreaterThan(40);
    expect(result.citedMoves).toContain('fit_acknowledgement');
    expect(result.citedSignals).toContain('typescript');
  });

  it('passes the system + user prompt to the injected adapter', async () => {
    const { stub, calls } = makeChatStub(happyResponseJson());
    await runReframe(baseInputs, { chat: stub });
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toMatch(/Recgon/);
    expect(calls[0].user).toMatch(/<reframe>/);
    expect(calls[0].user).toContain('typescript');
  });
});

describe('runReframe — schema reject', () => {
  it('throws ReframeError(schema_reject) on malformed JSON', async () => {
    const { stub } = makeChatStub('{ not valid json');
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      name: 'ReframeError',
      kind: 'schema_reject',
    });
  });

  it('throws ReframeError(schema_reject) when sentence too short', async () => {
    const bad = JSON.stringify({
      sentence: 'too short',
      cited_moves: ['fit_acknowledgement'],
      cited_signals: ['typescript'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'schema_reject',
    });
  });

  it('throws ReframeError(schema_reject) when cited_moves empty', async () => {
    const bad = JSON.stringify({
      sentence:
        'Your typescript background fits this one — start at src/lib/auth.ts.',
      cited_moves: [],
      cited_signals: ['typescript'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'schema_reject',
    });
  });
});

describe('runReframe — grounding reject (FRAME-07)', () => {
  it('rejects when sentence cites a skill NOT in declaredSkills', async () => {
    const bad = JSON.stringify({
      sentence:
        'Your rust background fits this one — start at src/lib/auth.ts to wire the login endpoint up.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['rust', 'src/lib/auth.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'grounding_reject',
    });
  });

  it('rejects when start_location cites a file NOT in recentProjectState or task.description', async () => {
    const bad = JSON.stringify({
      sentence:
        'Your typescript background fits this one — start at src/lib/payments/stripe.ts and follow the recent flow.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['typescript', 'src/lib/payments/stripe.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'grounding_reject',
    });
  });
});

describe('runReframe — empty profile + cited signal → grounding reject', () => {
  it('rejects citation when declared profile is empty and no recent state', async () => {
    const thinInputs: ReframeInputs = {
      ...baseInputs,
      assignee: {
        userId: 'user-2',
        declaredSkills: [],
        declaredInterests: [],
      },
      assignmentReasoning: null,
      recentProjectState: null,
    };
    const bad = JSON.stringify({
      sentence:
        'Your typescript background fits this one — start at src/lib/auth.ts to wire the login endpoint up.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['typescript', 'src/lib/auth.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(thinInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'grounding_reject',
    });
  });
});

describe('runReframe — tone reject (FRAME-06)', () => {
  it('rejects when sentence contains a flattery keyword', async () => {
    const bad = JSON.stringify({
      sentence:
        "You're great at typescript — start at src/lib/auth.ts and finish the login endpoint already wired up.",
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['typescript', 'src/lib/auth.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'tone_reject',
    });
  });

  it('rejects when sentence contains a pronoun (PRONOUN_DENY reuse)', async () => {
    const bad = JSON.stringify({
      sentence:
        'They will pick up typescript work at src/lib/auth.ts to wire the login endpoint up cleanly.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['typescript', 'src/lib/auth.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'tone_reject',
    });
  });

  it('rejects when sentence contains a shared-history phrase', async () => {
    const bad = JSON.stringify({
      sentence:
        'As you know, your typescript work fits at src/lib/auth.ts to wire the login endpoint cleanly here.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['typescript', 'src/lib/auth.ts'],
    });
    const { stub } = makeChatStub(bad);
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      kind: 'tone_reject',
    });
  });
});

describe('runReframe — llm_failure', () => {
  it('wraps adapter throw as ReframeError(llm_failure)', async () => {
    const { stub } = makeThrowingChat('upstream gemini outage');
    await expect(runReframe(baseInputs, { chat: stub })).rejects.toMatchObject({
      name: 'ReframeError',
      kind: 'llm_failure',
    });
  });
});

describe('runReframe — adapter injection', () => {
  it('uses opts.chat (no chatViaProviders call)', async () => {
    const stub = vi.fn(
      async (_system: string, _user: string): Promise<string> =>
        happyResponseJson(),
    );
    await runReframe(baseInputs, { chat: stub });
    expect(stub).toHaveBeenCalledTimes(1);
    // Argument shape: (systemPrompt, userPrompt, options?)
    const [systemPrompt, userPrompt] = stub.mock.calls[0];
    expect(typeof systemPrompt).toBe('string');
    expect(typeof userPrompt).toBe('string');
  });
});
