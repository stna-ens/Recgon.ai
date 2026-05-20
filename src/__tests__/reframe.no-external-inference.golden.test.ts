// Phase 4 Plan 03 / Task 3.3 — FRAME-07 grounding golden tests.
//
// Pins the FRAME-07 post-hoc grounding validator against 8 concrete
// LLM-emitted ungrounded outputs (the LLM inventing facts about the
// assignee that they never declared) plus 2 negative controls.
//
// FRAME-07 says: every `cited_signal` must trace back to:
//   - declaredSkills (assignee profile)
//   - declaredInterests (assignee profile)
//   - recentProjectState (commits / task titles / analytics change)
//   - OR the task body (title / description).
//
// Anything else is an "external inference" and must be rejected. The
// validator throws ReframeError with kind='grounding_reject' on any
// orphan signal — except where a tone violation triggers first (e.g.
// the word "love" in fixture 6 fires the tone gate). Fixture 6 uses a
// regex matcher to accept EITHER kind: the test asserts the validator
// rejects, not the specific ordering.

import { describe, expect, it } from 'vitest';
import { runReframe } from '@/lib/recgon/reframe';
import type {
  ReframeChatAdapter,
  ReframeInputs,
} from '@/lib/recgon/reframe';

// ── Helper: build inputs scoped to a specific assignee profile ─────────────
//
// Each grounding fixture has its OWN profile (different declaredSkills /
// declaredInterests / recentProjectState) so we can reject signals that
// the LLM is hallucinating for THAT specific assignee.

function buildInputsWithProfile(
  declaredSkills: string[],
  declaredInterests: string[],
  recentState: ReframeInputs['recentProjectState'],
): ReframeInputs {
  return {
    task: {
      id: 'task-1',
      title: 'Wire feature module',
      description:
        'Implement the feature module. No additional context beyond the title — the LLM is expected ' +
        'to ground its rationale in the assignee profile + the recent project state, not invent facts.',
      kind: 'dev_prompt',
    },
    assignee: {
      userId: 'user-1',
      declaredSkills,
      declaredInterests,
    },
    assignmentReasoning: null,
    recentProjectState: recentState,
  };
}

function makeChatAdapter(payload: unknown): ReframeChatAdapter {
  return async () => JSON.stringify(payload);
}

// Helper to assert grounding_reject (or either kind for ambiguous fixtures).
async function expectGroundingReject(inputs: ReframeInputs, payload: unknown): Promise<void> {
  await expect(runReframe(inputs, { chat: makeChatAdapter(payload) })).rejects.toMatchObject({
    kind: 'grounding_reject',
  });
}

async function expectEitherToneOrGrounding(inputs: ReframeInputs, payload: unknown): Promise<void> {
  await expect(runReframe(inputs, { chat: makeChatAdapter(payload) })).rejects.toMatchObject({
    kind: expect.stringMatching(/tone_reject|grounding_reject/),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────
//
// Each fixture is its OWN `it` block so the assertion text is grep-able.
// `buildInputsWithProfile` + `declaredSkills` appear at least 8 times in the
// file by construction, satisfying AC #3.

describe('FRAME-07 grounding validator — inferred-skill rejects (4 cases)', () => {
  it(`fixture 1: LLM invents 'React' skill not in declaredSkills → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript'],
      ['design'],
      { recentCommitFiles: ['src/components/Chat.tsx'] },
    );
    const payload = {
      sentence:
        'Your React expertise makes src/components/Chat.tsx a natural starting point for this task.',
      cited_moves: ['fit_acknowledgement', 'start_location'] as const,
      cited_signals: ['React', 'src/components/Chat.tsx'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });

  it(`fixture 2: LLM invents 'Go' background; cited_signals missing src/api/server.ts → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['Postgres'],
      [],
      { recentCommitFiles: ['src/api/server.ts'] },
    );
    const payload = {
      sentence:
        'Your Go background fits this performance refactor in src/api/server.ts beautifully overall.',
      cited_moves: ['fit_acknowledgement'] as const,
      cited_signals: ['Go'] as const, // Go is not declared — orphan signal
    };
    await expectGroundingReject(inputs, payload);
  });

  it(`fixture 3: LLM invents 'Rust' strength → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['Python'],
      ['data'],
      null,
    );
    const payload = {
      sentence:
        'Rust is your strength so this systems task is a natural fit for your declared profile area.',
      cited_moves: ['fit_acknowledgement'] as const,
      cited_signals: ['Rust'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });

  it(`fixture 4: LLM invents 'design' interest; not in declaredInterests → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript', 'React'],
      [], // no declared interests — "design" is invented
      { recentCommitFiles: ['src/components'] },
    );
    const payload = {
      sentence:
        'Your design taste fits this UI polish task in src/components based on your declared profile.',
      cited_moves: ['fit_acknowledgement', 'start_location'] as const,
      cited_signals: ['design', 'src/components'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });

  // WR-03: short declared values (single-letter "C" skill, common in
  // legacy profile rows) previously made the haystack-includes branch
  // pass for ANY cited_signal containing the letter — "react", "go", "c",
  // "python" all leaked through. The min-length gate (≥3 chars on both
  // sides) rejects this orphan signal.
  it(`fixture 4b: declaredSkills=['c'] + cited_signals=['react'] → grounding_reject (sub-3-char gate)`, async () => {
    const inputs = buildInputsWithProfile(
      ['c'], // single-letter declared skill
      [],
      null,
    );
    const payload = {
      sentence:
        'Your React experience and TypeScript depth make this UI component refactor a natural starting fit.',
      cited_moves: ['fit_acknowledgement'] as const,
      cited_signals: ['react'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });
});

describe('FRAME-07 grounding validator — inferred-preference rejects (2 cases)', () => {
  it(`fixture 5: LLM invents 'frontend' interest not in declaredInterests → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript'],
      ['security'], // declared = security; "frontend" is invented
      { recentCommitFiles: ['src/components/Refactor.tsx'] },
    );
    const payload = {
      sentence:
        'You enjoy frontend work — this React component refactor is your kind of task and matches.',
      cited_moves: ['fit_acknowledgement'] as const,
      cited_signals: ['frontend'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });

  it(`fixture 6: LLM invents 'CLI' interest — may trip tone_reject ('love') first; either rejection is correct`, async () => {
    const inputs = buildInputsWithProfile(
      ['Python'],
      ['ML'], // declared = ML; "CLI" is invented
      { recentCommitFiles: ['src/cli.ts'] },
    );
    const payload = {
      sentence:
        'You love writing CLIs so this command-runner task in src/cli.ts is a fit for your profile area.',
      cited_moves: ['fit_acknowledgement', 'start_location'] as const,
      cited_signals: ['CLI'] as const,
    };
    // The validator runs tone BEFORE grounding (cheaper rejection); the
    // word "love" trips FORBIDDEN_FLATTERY_WORDS. Either outcome is a
    // correct rejection of this LLM payload — assert with a regex matcher.
    await expectEitherToneOrGrounding(inputs, payload);
  });
});

describe('FRAME-07 grounding validator — inferred-recent-state rejects (2 cases)', () => {
  it(`fixture 7: LLM invents 'analytics drop on signup conversion' not in recentState → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript'],
      [],
      { recentCommitFiles: ['src/auth.ts'] }, // no recentAnalyticsChange
    );
    const payload = {
      sentence:
        'The recent analytics drop on signup conversion ties this auth refactor back to revenue squarely.',
      cited_moves: ['recent_state_link'] as const,
      cited_signals: ['analytics drop on signup conversion'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });

  it(`fixture 8: LLM invents 'payments flow' recent commit when recentState is null → grounding_reject`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript'],
      [],
      null, // no recentState at all
    );
    const payload = {
      sentence:
        'Your last commit on the payments flow makes this billing task next on the schedule queue.',
      cited_moves: ['recent_state_link'] as const,
      cited_signals: ['payments flow'] as const,
    };
    await expectGroundingReject(inputs, payload);
  });
});

describe('FRAME-07 grounding validator — negative controls (2 cases)', () => {
  it(`fixture 9: grounded sentence citing declaredSkill + recentCommitFiles → resolves`, async () => {
    const inputs = buildInputsWithProfile(
      ['TypeScript', 'React'],
      ['design'],
      { recentCommitFiles: ['src/components/Header.tsx'] },
    );
    const payload = {
      sentence:
        'Your React work and the recent commit in src/components/Header.tsx connect to this redesign task.',
      cited_moves: ['fit_acknowledgement', 'recent_state_link'] as const,
      cited_signals: ['React', 'src/components/Header.tsx'] as const,
    };
    const result = await runReframe(inputs, { chat: makeChatAdapter(payload) });
    expect(result.sentence).toBe(payload.sentence);
  });

  it(`fixture 10: grounded sentence citing declaredSkill + recentTaskTitles → resolves`, async () => {
    const inputs = buildInputsWithProfile(
      ['Postgres', 'SQL'],
      [],
      { recentTaskTitles: ['Add user index'] },
    );
    const payload = {
      sentence:
        "Your SQL depth and the prior 'Add user index' task make this migration the right next step here.",
      cited_moves: ['fit_acknowledgement', 'recent_state_link'] as const,
      cited_signals: ['SQL', 'Add user index'] as const,
    };
    const result = await runReframe(inputs, { chat: makeChatAdapter(payload) });
    expect(result.sentence).toBe(payload.sentence);
  });
});
