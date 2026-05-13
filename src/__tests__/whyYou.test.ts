// Phase 3 Plan 03 — whyYou.ts renderer unit tests.
//
// `renderWhyYou(reasoning)` is the single source of truth for the "Why you"
// line copy. Email + TaskDetailPanel both call it. Tests cover:
//   - 5 LLM reason_codes each render with the correct human header label
//     and use the LLM's reason_sentence verbatim
//   - confidence propagates to confidenceClass
//   - Math-only reasoning renders the math-only template with band labels
//     derived from skill_match + calendar_availability thresholds
//   - Defense-in-depth: malformed llm_tiebreaker (empty reason_sentence)
//     falls back to the math-only template
//   - HTML angle brackets are stripped defensively from every sentence

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
  skill: number,
  availability: number,
  overrides: Partial<AssignmentReasoning> = {},
): AssignmentReasoning {
  return {
    kind: 'math_only',
    mathScore: 0.75,
    mathBreakdown: {
      ...baseMathBreakdown,
      skillOverlap: skill,
      availabilityNow: availability,
    },
    ...overrides,
  } as AssignmentReasoning;
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

describe('renderWhyYou — LLM reason_codes (5 cases)', () => {
  it('recent_track_record renders the "Recent track record — …" header with verbatim sentence', () => {
    const reasoning = llmReasoning(
      'recent_track_record',
      'you finished 3 react tasks in the last two weeks.',
      'high',
    );
    const out = renderWhyYou(reasoning);
    expect(out.headerLabel).toBe('WHY YOU');
    expect(out.sentence).toBe(
      'Recent track record — you finished 3 react tasks in the last two weeks.',
    );
    expect(out.confidenceClass).toBe('high');
  });

  it('interest_match renders the "Interest match — …" header', () => {
    const reasoning = llmReasoning(
      'interest_match',
      'you flagged backend as an interest you want more of.',
    );
    const out = renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Interest match — you flagged backend as an interest you want more of.',
    );
  });

  it('skill_depth renders the "Skill depth — …" header', () => {
    const reasoning = llmReasoning(
      'skill_depth',
      'you have the deepest typescript history of the candidates.',
    );
    const out = renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Skill depth — you have the deepest typescript history of the candidates.',
    );
  });

  it('task_kind_familiarity renders the "Familiar work — …" header', () => {
    const reasoning = llmReasoning(
      'task_kind_familiarity',
      'dev tasks are your strongest kind by recent rating.',
      'low',
    );
    const out = renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Familiar work — dev tasks are your strongest kind by recent rating.',
    );
    expect(out.confidenceClass).toBe('low');
  });

  it('capacity_headroom renders the "Clearest week — …" header', () => {
    const reasoning = llmReasoning(
      'capacity_headroom',
      'your week is the clearest of the candidates.',
    );
    const out = renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Clearest week — your week is the clearest of the candidates.',
    );
  });
});

describe('renderWhyYou — math-only fallback', () => {
  it('uses skill+availability band labels (low/medium/high) when kind is math_only', () => {
    const reasoning = mathOnly(0.85, 0.75); // high / high
    const out = renderWhyYou(reasoning);
    expect(out.headerLabel).toBe('WHY YOU');
    expect(out.sentence).toContain('skill');
    expect(out.sentence).toContain('high');
    expect(out.confidenceClass).toBe('na');
  });

  it('renders the math-only template literally (no LLM voice)', () => {
    const reasoning = mathOnly(0.55, 0.5); // medium / medium
    const out = renderWhyYou(reasoning);
    expect(out.sentence).toBe(
      'Your fit score was strongest among teammates available this week (medium skill / medium availability).',
    );
  });

  it('thresholds: <0.4 → low, 0.4-0.7 → medium, ≥0.7 → high', () => {
    expect(renderWhyYou(mathOnly(0.3, 0.3)).sentence).toContain('low skill / low availability');
    expect(renderWhyYou(mathOnly(0.5, 0.5)).sentence).toContain('medium skill / medium availability');
    expect(renderWhyYou(mathOnly(0.8, 0.8)).sentence).toContain('high skill / high availability');
    expect(renderWhyYou(mathOnly(0.4, 0.4)).sentence).toContain('medium skill / medium availability');
    expect(renderWhyYou(mathOnly(0.7, 0.7)).sentence).toContain('high skill / high availability');
  });
});

describe('renderWhyYou — defense in depth', () => {
  it('llm_tiebreaker with empty reason_sentence falls back to math-only template', () => {
    const reasoning: AssignmentReasoning = {
      kind: 'llm_tiebreaker',
      mathScore: 0.75,
      mathBreakdown: { ...baseMathBreakdown, skillOverlap: 0.8, availabilityNow: 0.6 },
      judge: {
        task_id: 'task-1',
        chosen_candidate_id: 1,
        reason_code: 'skill_depth',
        reason_sentence: '',
        confidence: 'low',
      },
    };
    const out = renderWhyYou(reasoning);
    // Falls back to math template, not the LLM header.
    expect(out.sentence).toContain('Your fit score was strongest');
    expect(out.confidenceClass).toBe('na');
  });

  it('strips HTML angle brackets from every rendered sentence', () => {
    const reasoning = llmReasoning(
      'skill_depth',
      'you have <script>alert(1)</script> deep typescript experience.',
    );
    const out = renderWhyYou(reasoning);
    expect(out.sentence).not.toMatch(/[<>]/);
  });

  it('output sentence is plain text (no tags) for every reason_code', () => {
    const reasonCodes = [
      'recent_track_record',
      'interest_match',
      'skill_depth',
      'task_kind_familiarity',
      'capacity_headroom',
    ] as const;
    for (const code of reasonCodes) {
      const out = renderWhyYou(llmReasoning(code, 'normal sentence with > and < signs.'));
      expect(out.sentence).not.toMatch(/[<>]/);
    }
    const mathOut = renderWhyYou(mathOnly(0.6, 0.6));
    expect(mathOut.sentence).not.toMatch(/[<>]/);
  });
});
