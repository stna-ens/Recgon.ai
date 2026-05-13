// Phase 3 Plan 01 — judge.ts unit tests.
//
// RED scaffold for the pure `runJudgment` function. Covers:
//   - happy path → returns parsed JudgeResult
//   - malformed JSON → JudgeError
//   - schema-invalid (sentence > 25 words, chosen_candidate_id=4) → throws
//   - post-hoc validator: uncited skill, over-cited count, pronoun, cross-candidate ref
//   - anonymization snapshot — prompt body contains candidate_1/2/3 only, ZERO real names
//   - computeJudgeCacheKey is deterministic + order-independent
//
// Tests inject a stubbed `chat` adapter so we never hit a real LLM.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  runJudgment,
  computeJudgeCacheKey,
  JudgeError,
} from '@/lib/recgon/judge';
import type { JudgeTaskInput } from '@/lib/recgon/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

type BiasFixture = {
  fixture_id: string;
  task: {
    id: string;
    title: string;
    kind: string;
    requiredSkills: string[];
    estimatedHours: number;
  };
  candidates: Array<{
    anon_id: number;
    real_name: string;
    real_user_id: string;
    fit: {
      score: number;
      breakdown: {
        skill_match: number;
        fit_for_task_kind: number;
        calendar_availability: number;
        workload_headroom: number;
      };
    };
    confirmedSkills: string[];
    interests: string[];
    recentTasks: Array<{ kind: string; skills: string[]; avgRating?: number }>;
  }>;
};

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'judge-bias');
const FIXTURE_FILES = [
  'bias-01-english-male.json',
  'bias-02-turkish-female.json',
  'bias-03-arabic-male.json',
  'bias-04-east-asian-female.json',
  'bias-05-spanish-mixed.json',
];

function loadFixture(name: string): BiasFixture {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
  return JSON.parse(raw) as BiasFixture;
}

function fixtureToJudgeInput(fix: BiasFixture): JudgeTaskInput {
  return {
    taskId: fix.task.id,
    title: fix.task.title,
    kind: fix.task.kind,
    requiredSkills: fix.task.requiredSkills,
    estimatedHours: fix.task.estimatedHours,
    candidates: fix.candidates.map((c) => ({
      score: c.fit.score,
      breakdown: c.fit.breakdown,
      confirmedSkills: c.confirmedSkills,
      interests: c.interests,
      recentTasks: c.recentTasks,
    })),
  };
}

// ── Chat stub helper ────────────────────────────────────────────────────────

/**
 * Make a stub for the `chat` adapter that records its last call and returns
 * `canned` text verbatim. The shape matches `chatViaProviders` (the
 * single-arg form used by `runJudgment`).
 */
function makeChatStub(canned: string) {
  const calls: Array<{ system: string; user: string }> = [];
  const stub = async (system: string, user: string): Promise<string> => {
    calls.push({ system, user });
    return canned;
  };
  return { stub, calls };
}

// ── Test data builders ─────────────────────────────────────────────────────

function buildHappyResponse(taskId: string): string {
  return JSON.stringify({
    picks: [
      {
        task_id: taskId,
        chosen_candidate_id: 1,
        reason_code: 'recent_track_record',
        reason_sentence:
          'you finished two typescript tasks recently with strong ratings.',
        confidence: 'high',
      },
    ],
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('runJudgment — happy path', () => {
  it('returns parsed JudgeResult with chosen_candidate_id in {1,2,3}', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(buildHappyResponse(input.taskId));

    const result = await runJudgment([input], { chat: stub });

    expect(result.picks).toHaveLength(1);
    expect([1, 2, 3]).toContain(result.picks[0].chosen_candidate_id);
    expect(result.picks[0].task_id).toBe(input.taskId);
  });
});

describe('runJudgment — schema failures', () => {
  it('throws JudgeError on malformed JSON', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub('this is not JSON at all');

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on schema-invalid response — sentence > 25 words', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const longSentence = Array(40).fill('word').join(' ');
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: longSentence,
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on schema-invalid response — chosen_candidate_id=4', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 4,
            reason_code: 'recent_track_record',
            reason_sentence: 'you have done a great job recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — post-hoc content validator', () => {
  it('throws when sentence cites a skill NOT in confirmedSkills (skill_depth)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // Candidate 1 has confirmedSkills: ["typescript", "auth", "node"].
    // The reason cites "rust" which is NOT in confirmedSkills.
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'skill_depth',
            reason_sentence: 'your rust skill is the strongest match this week.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws when sentence over-cites recent task count (recent_track_record)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // Candidate 1 has 2 recent tasks. The reason claims "ten" which is > 2.
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'you finished ten similar tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws when sentence contains a pronoun (he/she/they/him/her/them/his/hers/theirs)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'she has finished similar typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws when sentence references another candidate (cross-candidate ref)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'your record beats candidate_2 on recent typescript tasks.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — anonymization snapshot', () => {
  it('prompt body sent to chat contains candidate_1/2/3 and ZERO real names from any fixture', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub, calls } = makeChatStub(buildHappyResponse(input.taskId));

    await runJudgment([input], { chat: stub });

    expect(calls).toHaveLength(1);
    const combined = calls[0].system + '\n' + calls[0].user;

    // Must reference anon labels.
    expect(combined).toMatch(/candidate.*1/i);
    expect(combined).toMatch(/candidate.*2/i);
    expect(combined).toMatch(/candidate.*3/i);

    // Must NOT contain any real name from any of the 5 fixtures.
    for (const file of FIXTURE_FILES) {
      const f = loadFixture(file);
      for (const c of f.candidates) {
        const firstName = c.real_name.split(/\s+/)[0];
        const lastName = c.real_name.split(/\s+/).slice(-1)[0];
        expect(combined).not.toContain(c.real_name);
        expect(combined).not.toContain(c.real_user_id);
        expect(combined).not.toContain(firstName);
        if (lastName && lastName !== firstName) {
          expect(combined).not.toContain(lastName);
        }
      }
    }
  });
});

describe('runJudgment — validator edge cases (Plan 04 Task 2)', () => {
  it('throws on empty reason_sentence (Zod schema .min(1) catches via JudgeError envelope)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: '',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on a unicode/non-English pronoun (deny-list catches elle/il/sie/er)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // "elle" is French/Spanish "she" — must be caught by the extended
    // pronoun deny-list. We frame it inside an otherwise valid sentence
    // so the test isolates the pronoun check (not length / cite checks).
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'elle finished similar typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on capitalized cross-candidate reference (Candidate_2 caught case-insensitively)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // The CROSS_CANDIDATE_REF regex uses /i; this locks the case-insensitive
    // behavior so a future regression that drops `/i` is caught here.
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'skill_depth',
            reason_sentence: 'Candidate_2 has solid typescript depth this week.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws when numeric-word count exceeds recentTasks length ("five" > 2)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // Candidate 1 has exactly 2 recent tasks. The reason claims "five" tasks
    // which is 5 > 2 — must be caught by the numeric-word recognizer.
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'you finished five typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — WR-04 Claude-style prose-wrapped JSON', () => {
  it('throws JudgeError on narrative-wrapped JSON (Claude fallback prose)', async () => {
    // The Gemini path enforces strict JSON mode, but the Claude fallback
    // may emit "Here is the analysis: { ... }. Let me know..." style
    // prose. The validator must catch this — the dispatcher's math
    // fallback then takes over (JUDGE-05).
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const validInner = JSON.stringify({
      picks: [
        {
          task_id: input.taskId,
          chosen_candidate_id: 1,
          reason_code: 'recent_track_record',
          reason_sentence: 'you finished two typescript tasks recently.',
          confidence: 'high',
        },
      ],
    });
    const wrapped = `Here is the analysis: ${validInner}. Let me know if you need any clarification.`;
    const { stub } = makeChatStub(wrapped);

    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — CR-02 duplicate task_id rejection', () => {
  it('throws JudgeError when the LLM returns two picks for the same task_id', async () => {
    const fixA = loadFixture('bias-01-english-male.json');
    const fixB = loadFixture('bias-02-turkish-female.json');
    const inputA = fixtureToJudgeInput(fixA);
    const inputB = fixtureToJudgeInput(fixB);

    // Both picks carry inputA.taskId — duplicate. The duplicate check must
    // fire BEFORE the per-input "skipped task_id" check (since both checks
    // would catch *something* here, we want to specifically lock that the
    // duplicate-detection path is the one that fires).
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: inputA.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'you finished two typescript tasks recently.',
            confidence: 'high',
          },
          {
            task_id: inputA.taskId, // duplicate
            chosen_candidate_id: 2,
            reason_code: 'recent_track_record',
            reason_sentence: 'you finished two typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([inputA, inputB], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
    await expect(runJudgment([inputA, inputB], { chat: stub })).rejects.toMatchObject({
      message: expect.stringContaining('duplicate pick'),
    });
  });
});

describe('runJudgment — WR-02 cross-candidate ref separators', () => {
  it('throws on "candidate 2" (space separator)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'skill_depth',
            reason_sentence: 'candidate 2 lacks typescript depth this week.',
            confidence: 'high',
          },
        ],
      }),
    );
    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on "Candidate-2" (hyphen separator, capitalized)', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'skill_depth',
            reason_sentence: 'Candidate-2 lacks typescript depth this week.',
            confidence: 'high',
          },
        ],
      }),
    );
    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — WR-01 extended pronoun coverage', () => {
  it('throws on Portuguese pronoun "ela"', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'ela finished typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );
    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on Italian pronoun "lui"', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: 'lui finished typescript tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );
    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });

  it('throws on pronoun adjacent to apostrophe ("she\'s")', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            reason_sentence: "she's finished typescript tasks recently.",
            confidence: 'high',
          },
        ],
      }),
    );
    await expect(runJudgment([input], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('runJudgment — WR-08 recent_track_record empty guard', () => {
  it('throws when reason_code is recent_track_record but candidate has zero recent tasks', async () => {
    // Build a JudgeTaskInput where candidate 1 has empty recentTasks. We
    // start from a fixture and overwrite candidate 1's recentTasks to [].
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    const inputWithEmpty: JudgeTaskInput = {
      ...input,
      candidates: input.candidates.map((c, i) =>
        i === 0 ? { ...c, recentTasks: [] } : c,
      ),
    };
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'recent_track_record',
            // Sentence WITHOUT a number — pre-WR-08, this passed because
            // the number-token loop iterated over zero tokens.
            reason_sentence: 'you have completed similar tasks recently.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([inputWithEmpty], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
    await expect(runJudgment([inputWithEmpty], { chat: stub })).rejects.toMatchObject({
      message: expect.stringContaining('no recent tasks'),
    });
  });
});

describe('runJudgment — WR-05 skill `ts` does not match `typescript`', () => {
  it('rejects skill_depth where confirmedSkills has `ts` but sentence cites `typescript`', async () => {
    const fix = loadFixture('bias-01-english-male.json');
    const input = fixtureToJudgeInput(fix);
    // Candidate 1's confirmedSkills includes typescript already. We
    // narrow to just `ts` (shorthand that does NOT appear in
    // "typescript" via the whole-word boundary) and the LLM sentence
    // mentions typescript. The validator must reject.
    const inputTsOnly: JudgeTaskInput = {
      ...input,
      candidates: input.candidates.map((c, i) =>
        i === 0 ? { ...c, confirmedSkills: ['ts'] } : c,
      ),
    };
    const { stub } = makeChatStub(
      JSON.stringify({
        picks: [
          {
            task_id: input.taskId,
            chosen_candidate_id: 1,
            reason_code: 'skill_depth',
            reason_sentence: 'your typescript skill is the strongest match this week.',
            confidence: 'high',
          },
        ],
      }),
    );

    await expect(runJudgment([inputTsOnly], { chat: stub })).rejects.toBeInstanceOf(JudgeError);
  });
});

describe('computeJudgeCacheKey', () => {
  it('is deterministic for identical inputs', () => {
    const k1 = computeJudgeCacheKey('tsk-1', ['a', 'b', 'c'], 'hash-xyz');
    const k2 = computeJudgeCacheKey('tsk-1', ['a', 'b', 'c'], 'hash-xyz');
    expect(k1).toBe(k2);
  });

  it('is order-independent on candidate IDs', () => {
    const k1 = computeJudgeCacheKey('tsk-1', ['a', 'b', 'c'], 'hash-xyz');
    const k2 = computeJudgeCacheKey('tsk-1', ['c', 'a', 'b'], 'hash-xyz');
    const k3 = computeJudgeCacheKey('tsk-1', ['b', 'c', 'a'], 'hash-xyz');
    expect(k1).toBe(k2);
    expect(k1).toBe(k3);
  });

  it('changes when taskId changes', () => {
    const k1 = computeJudgeCacheKey('tsk-1', ['a', 'b'], 'h');
    const k2 = computeJudgeCacheKey('tsk-2', ['a', 'b'], 'h');
    expect(k1).not.toBe(k2);
  });

  it('changes when mathScoresHash changes', () => {
    const k1 = computeJudgeCacheKey('tsk-1', ['a', 'b'], 'h1');
    const k2 = computeJudgeCacheKey('tsk-1', ['a', 'b'], 'h2');
    expect(k1).not.toBe(k2);
  });
});
