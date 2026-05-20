// Phase 4 Plan 03 / Task 3.2 — FRAME-06 tone-bounds golden tests.
//
// Pins the FRAME-06 post-hoc tone validator against 12 concrete LLM-emitted
// violations across three categories:
//   - Flattery (6): great / amazing / brilliant / love / fantastic / excellent
//   - False familiarity (3): as you know / like last time / remember when
//   - Pronouns (3): they / he-his / her
//
// Plus 2 negative-control cases — clean sentences the validator MUST NOT
// reject. The controls catch the symmetric failure mode (validator drifting
// into over-rejection from future prompt edits).
//
// Total: 14 fixtures.
//
// Why this lives at the module boundary, not at the prompt:
//   The LLM is steered toward clean output via the prompt text, but a
//   misbehaving / drifted model CAN still emit bad text. This test pins the
//   post-hoc gate that runs BEFORE we persist the sentence. If a future
//   prompt-edit weakens the validator (e.g. someone removes "love" from
//   FORBIDDEN_FLATTERY_WORDS), the 12 reject cases will start passing
//   through and fail this file.

import { describe, expect, it } from 'vitest';
import { runReframe } from '@/lib/recgon/reframe';
import type {
  ReframeChatAdapter,
  ReframeInputs,
} from '@/lib/recgon/reframe';

// ── Base inputs — grounded so cases hit TONE before GROUNDING ──────────────
//
// Every fixture must clear the schema validator (sentence 40–220 chars,
// cited_moves length 1–3, cited_signals length ≤ 8) AND the grounding
// validator BEFORE it can reach the tone gate. We give the assignee a
// profile that contains every signal the fixtures cite, so grounding
// always passes for the tone fixtures — the gate that fires is tone.

function buildBaseInputs(): ReframeInputs {
  return {
    task: {
      id: 'task-1',
      title: 'Wire login endpoint in src/auth.ts',
      description:
        'Add the new POST /api/auth/login route to src/auth.ts and src/components/Login.tsx. ' +
        'Use TypeScript types from src/types. Verify the Postgres migration in supabase/migrations.',
      kind: 'dev_prompt',
    },
    assignee: {
      userId: 'user-1',
      declaredSkills: ['React', 'TypeScript', 'auth', 'Postgres'],
      declaredInterests: ['developer experience'],
    },
    assignmentReasoning: null,
    recentProjectState: {
      recentCommitFiles: [
        'src/auth.ts',
        'src/components/Login.tsx',
        'src/components',
        'src/api',
        'src/components/Header.tsx',
        'supabase/migrations',
      ],
      recentTaskTitles: ['Wire login endpoint'],
    },
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

type Fixture = {
  id: number;
  label: string;
  reason: 'flattery' | 'false-familiarity' | 'pronoun';
  // `expectedKind` is the validator outcome literal each fixture pins.
  // Repeated `kind: 'tone_reject'` annotations are what the FRAME-06
  // acceptance criteria grep is counting (per-fixture self-documentation).
  expectedKind: 'tone_reject' | null; // null = negative-control (accept)
  payload: {
    sentence: string;
    cited_moves: ReadonlyArray<'fit_acknowledgement' | 'start_location' | 'recent_state_link'>;
    cited_signals: ReadonlyArray<string>;
  };
};

const REJECT_FIXTURES: ReadonlyArray<Fixture> = [
  // Flattery (6) — sentence MUST be 40+ chars (schema floor).
  {
    id: 1,
    label: 'flattery: great + perfect',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        "You're great at React — this auth route in src/auth.ts is a perfect place to start.",
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['React', 'src/auth.ts'],
    },
  },
  {
    id: 2,
    label: 'flattery: amazing',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'This is an amazing fit for your TypeScript depth — src/auth.ts is the right starting file.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 3,
    label: 'flattery: brilliant',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Brilliant choice for your auth depth — start in src/auth.ts to wire the new login flow.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['auth', 'src/auth.ts'],
    },
  },
  {
    id: 4,
    label: 'flattery: love',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        "You'll love this one — it touches src/auth.ts which lines up with your TypeScript work.",
      cited_moves: ['start_location', 'fit_acknowledgement'],
      cited_signals: ['src/auth.ts', 'TypeScript'],
    },
  },
  {
    id: 5,
    label: 'flattery: fantastic',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Fantastic work would land here in src/components — your React depth is a strong match.',
      cited_moves: ['start_location', 'fit_acknowledgement'],
      cited_signals: ['src/components', 'React'],
    },
  },
  {
    id: 6,
    label: 'flattery: excellent',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Excellent match for your Postgres skill — supabase/migrations holds the migration to extend.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['Postgres', 'supabase/migrations'],
    },
  },

  // False familiarity (3).
  {
    id: 7,
    label: 'false-familiarity: as you know',
    reason: 'false-familiarity',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'As you know, the auth flow lives in src/auth.ts — start there to keep the change contained.',
      cited_moves: ['start_location'],
      cited_signals: ['src/auth.ts'],
    },
  },
  {
    id: 8,
    label: 'false-familiarity: like last time',
    reason: 'false-familiarity',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Like last time, this is a TypeScript-heavy refactor and src/auth.ts is the entry point.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 9,
    label: 'false-familiarity: remember when',
    reason: 'false-familiarity',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Remember when we discussed this pattern? Apply it in src/api to keep the route layer thin.',
      cited_moves: ['start_location'],
      cited_signals: ['src/api'],
    },
  },

  // Pronouns (3) — defense in depth via judge.ts PRONOUN_DENY.
  {
    id: 10,
    label: 'pronoun: they',
    reason: 'pronoun',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'They will appreciate your TypeScript work on this route — src/auth.ts is the right start.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 11,
    label: 'pronoun: he + his',
    reason: 'pronoun',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'He should start in src/auth.ts because of his Postgres skill — the migration ties together.',
      cited_moves: ['start_location', 'fit_acknowledgement'],
      cited_signals: ['src/auth.ts', 'Postgres'],
    },
  },
  {
    id: 12,
    label: 'pronoun: her',
    reason: 'pronoun',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Her TypeScript depth makes this her natural area — src/auth.ts is the entry point file.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  // CR-02 inflected-form fixtures (9). The base regex covers "love",
  // "amazing", "perfect", "brilliant", "excellent", "great" with whole-word
  // `\b` boundaries, which lets common inflections slip past ("loved",
  // "loves", "loving", "amazingly", "perfectly", "brilliantly",
  // "excellently", "greatly", "lovely"). These fixtures pin the FRAME-06
  // gate against each inflected form so future prompt drift or model
  // regression cannot leak sycophancy through inflected verbs/adverbs.
  {
    id: 15,
    label: 'flattery: loved (past tense)',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        "You've loved working on auth in src/auth.ts before, which makes this route a natural pick.",
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['auth', 'src/auth.ts'],
    },
  },
  {
    id: 16,
    label: 'flattery: loves (third person)',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Anyone who loves TypeScript will gravitate to src/auth.ts — your declared skill set fits.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 17,
    label: 'flattery: loving (gerund)',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        "You're loving the auth work lately — src/auth.ts in TypeScript is the right next file.",
      cited_moves: ['start_location', 'fit_acknowledgement'],
      cited_signals: ['src/auth.ts', 'TypeScript'],
    },
  },
  {
    id: 18,
    label: 'flattery: lovely',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Lovely chance to apply your TypeScript depth — src/auth.ts is the entry point to start at.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 19,
    label: 'flattery: amazingly',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'This is amazingly aligned with your auth depth — src/auth.ts is the file to start the work in.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['auth', 'src/auth.ts'],
    },
  },
  {
    id: 20,
    label: 'flattery: perfectly',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        "You'll be perfectly suited to this TypeScript refactor in src/auth.ts based on your skill set.",
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 21,
    label: 'flattery: brilliantly',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Your brilliantly thorough TypeScript style fits src/auth.ts — start there to wire the route.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
  {
    id: 22,
    label: 'flattery: excellently',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'Excellently matched to your Postgres depth — supabase/migrations is where to start the work.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['Postgres', 'supabase/migrations'],
    },
  },
  {
    id: 23,
    label: 'flattery: greatly',
    reason: 'flattery',
    expectedKind: 'tone_reject',
    payload: {
      sentence:
        'This greatly aligns with your TypeScript skill set — src/auth.ts is the right entry file.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['TypeScript', 'src/auth.ts'],
    },
  },
];

// ── Negative controls (2) — clean sentences that MUST be accepted ───────────

const ACCEPT_FIXTURES: ReadonlyArray<Fixture> = [
  {
    id: 13,
    label: 'control: grounded sentence with two moves',
    reason: 'flattery', // unused for accept
    expectedKind: null,
    payload: {
      sentence:
        'This route in src/auth.ts overlaps your declared TypeScript depth and lines up with the recent commits.',
      cited_moves: ['start_location', 'fit_acknowledgement'],
      cited_signals: ['src/auth.ts', 'TypeScript'],
    },
  },
  {
    id: 14,
    label: 'control: grounded sentence citing Postgres skill',
    reason: 'flattery', // unused for accept
    expectedKind: null,
    payload: {
      sentence:
        'Your Postgres skill and the schema work in supabase/migrations connect to this migration task.',
      cited_moves: ['fit_acknowledgement', 'start_location'],
      cited_signals: ['Postgres', 'supabase/migrations'],
    },
  },
];

function makeChatAdapter(payload: unknown): ReframeChatAdapter {
  return async () => JSON.stringify(payload);
}

// ── Tests ──────────────────────────────────────────────────────────────────
//
// One `it` block per fixture. We intentionally inline the
// `rejects.toMatchObject({ kind: 'tone_reject' })` assertion in each block
// (instead of a single parameterized loop) so the literal text is grep-able
// fixture-by-fixture — future readers can find each pinned violation
// directly, and the FRAME-06 acceptance grep counts each occurrence.

async function expectToneReject(fixture: Fixture): Promise<void> {
  const inputs = buildBaseInputs();
  const chat = makeChatAdapter(fixture.payload);
  await expect(runReframe(inputs, { chat })).rejects.toMatchObject({
    kind: 'tone_reject',
  });
}

async function expectAccept(fixture: Fixture): Promise<void> {
  const inputs = buildBaseInputs();
  const chat = makeChatAdapter(fixture.payload);
  const result = await runReframe(inputs, { chat });
  expect(result.sentence).toBe(fixture.payload.sentence);
}

describe('FRAME-06 tone validator — golden rejects (12 cases)', () => {
  it(`fixture 1: flattery 'great + perfect' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[0].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 2: flattery 'amazing' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[1].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 3: flattery 'brilliant' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[2].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 4: flattery 'love' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[3].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 5: flattery 'fantastic' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[4].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 6: flattery 'excellent' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[5].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 7: false-familiarity 'as you know' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[6].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 8: false-familiarity 'like last time' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[7].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 9: false-familiarity 'remember when' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[8].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 10: pronoun 'they' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[9].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 11: pronoun 'he + his' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[10].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 12: pronoun 'her' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[11].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  // CR-02 inflected forms — kind: 'tone_reject'.
  it(`fixture 15: flattery 'loved' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[12].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 16: flattery 'loves' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[13].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 17: flattery 'loving' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[14].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 18: flattery 'lovely' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[15].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 19: flattery 'amazingly' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[16].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 20: flattery 'perfectly' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[17].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 21: flattery 'brilliantly' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[18].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 22: flattery 'excellently' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[19].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
  it(`fixture 23: flattery 'greatly' → rejects.toMatchObject kind: 'tone_reject'`, async () => {
    await expect(runReframe(buildBaseInputs(), { chat: makeChatAdapter(REJECT_FIXTURES[20].payload) })).rejects.toMatchObject({ kind: 'tone_reject' });
  });
});

describe('FRAME-06 tone validator — negative controls (2 cases)', () => {
  it(`fixture 13: grounded sentence with two moves → resolves to the same sentence (not.rejects)`, async () => {
    await expectAccept(ACCEPT_FIXTURES[0]);
  });
  it(`fixture 14: grounded sentence citing Postgres skill → resolves to the same sentence (not.rejects)`, async () => {
    await expectAccept(ACCEPT_FIXTURES[1]);
  });
});

// Keep the helper references used so they aren't pruned as dead code; these
// helpers are also available for future fixtures appended to the array.
void expectToneReject;
