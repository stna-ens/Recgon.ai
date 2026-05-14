// Phase 3 Plan 03 — "Why you" copy renderer.
//
// Single source of truth for the one-line explanation that surfaces in:
//   1. The assignment email (`notifyTeammateAssigned` in dispatcher.ts)
//   2. The task pop-up (`TaskDetailPanel.tsx`)
//
// Pure data → string transform. NO LLM calls. NO network. NO Supabase. The
// LLM-generated `reason_sentence` is taken VERBATIM (already post-validated
// by `judge.ts` in Plan 01); this module prepends the human header label
// and never paraphrases.
//
// Voice (Phase 1 D-21): Recgon IS the AI Product Manager — direct
// second-person address ("you finished 3 tasks…"), not "the AI says".
//
// Privacy: this module is pure. The viewer-role privacy filter lives at the
// API boundary (`route.ts` strips `whyYouSentence` for non-assignees); the
// renderer itself doesn't know who's reading.

import type { AssignmentReasoning } from './types';

export type WhyYouOutput = {
  // Locale-stable label for now. The eyebrow heading on TaskDetailPanel
  // uses `recgon-label` styling — see CONTEXT D-29 mock.
  headerLabel: string;
  // The one-line explanation. ≤ ~120 chars after rendering; ≤ 25 words for
  // LLM-sourced sentences (enforced upstream by Plan 01's Zod schema).
  sentence: string;
  // 'na' for math-only assignments (confidence has no meaning when no LLM
  // judgment was invoked).
  confidenceClass: 'low' | 'medium' | 'high' | 'na';
};

// ── Reason-code template table ─────────────────────────────────────────────
//
// One template per `reason_code` value. The `reason_sentence` from the LLM
// is inserted VERBATIM after the header. Adding a new reason_code? Add a
// row here AND update the REASON_CODES enum in schemas.ts.

const REASON_HEADERS: Record<string, string> = {
  recent_track_record: 'Recent track record',
  interest_match: 'Interest match',
  skill_depth: 'Skill depth',
  task_kind_familiarity: 'Familiar work',
  capacity_headroom: 'Clearest week',
};

// ── Defensive HTML strip ───────────────────────────────────────────────────
//
// Belt-and-suspenders against an LLM that somehow produced angle brackets
// inside `reason_sentence`. React's default JSX escaping already protects
// the DOM render path; this also defends the plain-text email path and any
// future consumer that doesn't auto-escape.

function stripHtml(s: string): string {
  return s.replace(/[<>]/g, '');
}

// ── Renderer ───────────────────────────────────────────────────────────────

export function renderWhyYou(reasoning: AssignmentReasoning): WhyYouOutput {
  // Defense in depth: if the llm_tiebreaker envelope is somehow malformed
  // (empty sentence, missing reason_code), fall back to the math-only
  // template rather than producing a broken line.
  if (reasoning.kind === 'llm_tiebreaker') {
    const sentence = reasoning.judge.reason_sentence?.trim();
    const header = REASON_HEADERS[reasoning.judge.reason_code];
    if (sentence && header) {
      return {
        headerLabel: 'WHY YOU',
        sentence: stripHtml(`${header} — ${sentence}`),
        confidenceClass: reasoning.judge.confidence,
      };
    }
    // Fall through to math-only rendering with the embedded breakdown.
    return renderMathOnly(reasoning.mathBreakdown);
  }
  return renderMathOnly(reasoning.mathBreakdown);
}

/**
 * Build the math-only sentence from a math breakdown. Used both when
 * `kind === 'math_only'` AND when an LLM-tiebreaker envelope is malformed.
 *
 * Voice rule: never expose raw band labels ("low / medium / high") to the
 * assignee — that reads as the system grading the teammate in their face.
 * Instead, pick the SINGLE strongest signal and lead with it in PM voice.
 *
 * Degenerate case (no signal stood out — every breakdown field below
 * SIGNAL_FLOOR): explicit honest fallback that doesn't pretend a reason
 * existed.
 */

// Below this floor a signal is too weak to honestly cite as the reason
// you were picked. With every signal below the floor we use the explicit
// "no teammate stood out" copy rather than fabricating a winner.
const SIGNAL_FLOOR = 0.15;

const MATH_SIGNAL_COPY: Array<{
  key: 'skillOverlap' | 'availabilityNow' | 'fitForKind' | 'loadHeadroom' | 'interestNudge';
  sentence: string;
}> = [
  { key: 'skillOverlap',    sentence: 'Your background matches what this task needs.' },
  { key: 'availabilityNow', sentence: 'You have the clearest week ahead of you.' },
  { key: 'fitForKind',      sentence: "This is the kind of work you've been doing lately." },
  { key: 'loadHeadroom',    sentence: 'Your plate has the most room for this right now.' },
  { key: 'interestNudge',   sentence: "This lines up with what you've shown interest in." },
];

function renderMathOnly(
  mathBreakdown: AssignmentReasoning extends { mathBreakdown: infer M } ? M : never,
): WhyYouOutput {
  // Find the strongest signal across the five breakdown fields. Stable
  // order: when two signals tie (e.g. all zeros), the first entry in
  // MATH_SIGNAL_COPY wins, so output stays deterministic.
  let top: { score: number; sentence: string } = {
    score: -Infinity,
    sentence: MATH_SIGNAL_COPY[0].sentence,
  };
  for (const { key, sentence } of MATH_SIGNAL_COPY) {
    const score = mathBreakdown[key];
    if (typeof score === 'number' && score > top.score) {
      top = { score, sentence };
    }
  }

  // No real signal — be honest about it rather than masking with a band.
  if (top.score < SIGNAL_FLOOR) {
    return {
      headerLabel: 'WHY YOU',
      sentence: 'Picking you for this one — no teammate had a clear edge, so going on overall availability.',
      confidenceClass: 'na',
    };
  }

  return {
    headerLabel: 'WHY YOU',
    sentence: stripHtml(top.sentence),
    confidenceClass: 'na',
  };
}
