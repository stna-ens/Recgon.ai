// Phase 3 Plan 05 — whyYou.ts renderer unit tests (rewritten).
//
// `renderWhyYou(reasoning, opts?)` is now async. Math-only template path
// is DELETED (Plan 05 / Gap-2 closure). The renderer is a thin reader:
//   - llm_tiebreaker → returns "Header — judge sentence" from the
//     pre-validated runJudgment output (UNCHANGED from Plan 03-03).
//   - math_only with pre-rendered `whyYouSentence` on the envelope →
//     returns it verbatim with NO new LLM call.
//   - math_only with `whyYouSentence === null` (dispatcher tried and
//     got null) → returns {sentence: null}.
//   - math_only with `whyYouSentence === undefined` AND no opts →
//     returns {sentence: null} (legacy row, no inputs to retry).
//   - math_only with `whyYouSentence === undefined` AND opts → calls
//     the LLM via the injected chat adapter.

import { describe, expect, it } from 'vitest';
import { renderWhyYou } from '@/lib/recgon/whyYou';
import type { AssignmentReasoning } from '@/lib/recgon/types';

const baseMathBreakdown = {
  skillOverlap: 0.85,
  fitForKind: 0.7,
  availabilityNow: 0.8,
  loadHeadroom: 0.6,
  interestNudge: 0,
};

function mathOnly(
  whyYouSentence?: string | null,
): AssignmentReasoning {
  return {
    kind: 'math_only',
    mathScore: 0.75,
    mathBreakdown: baseMathBreakdown,
    whyYouSentence,
  };
}

function llmReasoning(
  reasonCode:
    | 'recent_track_record'
    | 'interest_match'
    | 'skill_depth'
    | 'task_kind_familiarity'
    | 'capacity_headroom',
  sentence: string,
  confidence: 'low' | 'medium' | 'high' = 'medium',
): AssignmentReasoning {
  return {
    kind: 'llm_tiebreaker',
    mathScore: 0.75,
    mathBreakdown: baseMathBreakdown,
    judge: {
      task_id: 'task-1',
      chosen_candidate_id: 1,
      reason_code: reasonCode,
      reason_sentence: sentence,
      confidence,
    },
  };
}

describe('renderWhyYou — LLM judge reason_codes (5 cases, UNCHANGED from Plan 03)', () => {
  it('recent_track_record renders the "Recent track record — …" header with verbatim sentence', async () => {
    const reasoning = llmReasoning(
      'recent_track_record',
      'you finished 3 react tasks in the last two weeks.',
      'high',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.headerLabel).toBe('WHY YOU');
    expect(out.sentence).toBe(
      'Recent track record — you finished 3 react tasks in the last two weeks.',
    );
    expect(out.confidenceClass).toBe('high');
  });

  it('interest_match renders the "Interest match — …" header', async () => {
    const reasoning = llmReasoning(
      'interest_match',
      'you flagged backend as an interest you want more of.',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Interest match — you flagged backend as an interest you want more of.',
    );
  });

  it('skill_depth renders the "Skill depth — …" header', async () => {
    const reasoning = llmReasoning(
      'skill_depth',
      'you have the deepest typescript history of the candidates.',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Skill depth — you have the deepest typescript history of the candidates.',
    );
  });

  it('task_kind_familiarity renders the "Familiar work — …" header', async () => {
    const reasoning = llmReasoning(
      'task_kind_familiarity',
      'dev tasks are your strongest kind by recent rating.',
      'low',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Familiar work — dev tasks are your strongest kind by recent rating.',
    );
    expect(out.confidenceClass).toBe('low');
  });

  it('capacity_headroom renders the "Clearest week — …" header', async () => {
    const reasoning = llmReasoning(
      'capacity_headroom',
      'your week is the clearest of the candidates.',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Clearest week — your week is the clearest of the candidates.',
    );
  });
});

describe('renderWhyYou — math_only with pre-rendered sentence (Plan 05)', () => {
  it('returns the pre-rendered sentence verbatim when the envelope carries one', async () => {
    const reasoning = mathOnly('You finished 3 typescript tasks recently.');
    const out = await renderWhyYou(reasoning);
    expect(out.headerLabel).toBe('WHY YOU');
    expect(out.sentence).toBe('You finished 3 typescript tasks recently.');
    expect(out.confidenceClass).toBe('na');
  });

  it('returns {sentence:null} when whyYouSentence is explicitly null (LLM tried and failed)', async () => {
    const reasoning = mathOnly(null);
    const out = await renderWhyYou(reasoning);
    expect(out.headerLabel).toBe('WHY YOU');
    expect(out.sentence).toBeNull();
    expect(out.confidenceClass).toBe('na');
  });

  it('returns {sentence:null} when whyYouSentence is undefined and no opts provided (legacy row)', async () => {
    const reasoning = mathOnly(undefined);
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBeNull();
    expect(out.confidenceClass).toBe('na');
  });

  it('strips angle brackets from the pre-rendered sentence', async () => {
    const reasoning = mathOnly('You have <script>alert(1)</script> deep typescript.');
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).not.toMatch(/[<>]/);
  });
});

describe('renderWhyYou — math_only legacy-row LLM retry via opts (Plan 05)', () => {
  it('calls the injected chat adapter when whyYouSentence is undefined and opts threaded', async () => {
    const reasoning = mathOnly(undefined);
    let calls = 0;
    const chat = async () => {
      calls += 1;
      return JSON.stringify({
        sentence: 'Your typescript depth is the strongest match.',
        cited_signal: 'skill_depth',
      });
    };

    const out = await renderWhyYou(reasoning, {
      task: {
        id: 'task-1',
        title: 'Refactor session cookies',
        kind: 'code',
        requiredSkills: ['typescript'],
        estimatedHours: 4,
      },
      candidate: {
        declaredSkills: ['typescript', 'auth'],
        interests: [],
        recentTasks: [],
      },
      chat,
    });

    expect(calls).toBe(1);
    expect(out.sentence).toBe('Your typescript depth is the strongest match.');
    expect(out.confidenceClass).toBe('na');
  });

  it('returns {sentence:null} when injected chat returns ungrounded sentence (validator rejects)', async () => {
    const reasoning = mathOnly(undefined);
    const chat = async () =>
      JSON.stringify({
        sentence: 'Your rust experience makes you a great fit.',
        cited_signal: 'skill_depth',
      });

    const out = await renderWhyYou(reasoning, {
      task: {
        id: 'task-1',
        title: 'Refactor session cookies',
        kind: 'code',
        requiredSkills: ['typescript'],
        estimatedHours: 4,
      },
      candidate: {
        declaredSkills: ['typescript', 'auth'],
        interests: [],
        recentTasks: [],
      },
      chat,
    });
    expect(out.sentence).toBeNull();
  });
});

describe('renderWhyYou — defense in depth', () => {
  it('llm_tiebreaker with empty reason_sentence falls through to math_only path', async () => {
    const reasoning: AssignmentReasoning = {
      kind: 'llm_tiebreaker',
      mathScore: 0.75,
      mathBreakdown: baseMathBreakdown,
      judge: {
        task_id: 'task-1',
        chosen_candidate_id: 1,
        reason_code: 'skill_depth',
        reason_sentence: '',
        confidence: 'low',
      },
      whyYouSentence: 'Pre-rendered fallback sentence.',
    };
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).toBe('Pre-rendered fallback sentence.');
    expect(out.confidenceClass).toBe('na');
  });

  it('strips HTML angle brackets from every judge-rendered sentence', async () => {
    const reasoning = llmReasoning(
      'skill_depth',
      'you have <script>alert(1)</script> deep typescript experience.',
    );
    const out = await renderWhyYou(reasoning);
    expect(out.sentence).not.toMatch(/[<>]/);
  });

  it('output sentence is plain text (no tags) for every reason_code', async () => {
    const reasonCodes = [
      'recent_track_record',
      'interest_match',
      'skill_depth',
      'task_kind_familiarity',
      'capacity_headroom',
    ] as const;
    for (const code of reasonCodes) {
      const out = await renderWhyYou(
        llmReasoning(code, 'normal sentence with > and < signs.'),
      );
      expect(out.sentence).not.toMatch(/[<>]/);
    }
  });
});
