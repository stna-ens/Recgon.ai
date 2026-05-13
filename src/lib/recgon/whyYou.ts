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

// ── Threshold helper for math-only band labels ──────────────────────────────
//
// Plan 03-03 requirement: thresholds are <0.4 = low, 0.4-0.7 = medium,
// ≥0.7 = high. These differ slightly from `prompts.ts`'s `bandLabel` (which
// uses 0.45) — that one feeds the LLM prompt and is intentionally tuned for
// LLM clarity; this one feeds human-facing copy.

function band(n: number): 'low' | 'medium' | 'high' {
  if (n >= 0.7) return 'high';
  if (n >= 0.4) return 'medium';
  return 'low';
}

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
 * The two signals we surface are skill overlap and calendar availability —
 * the two most legible numbers from a teammate's perspective. Workload
 * headroom is a derived quantity; fit-for-kind is too internal a concept
 * to surface as a band label.
 */
function renderMathOnly(
  mathBreakdown: AssignmentReasoning extends { mathBreakdown: infer M } ? M : never,
): WhyYouOutput {
  const skillBand = band(mathBreakdown.skillOverlap);
  const availBand = band(mathBreakdown.availabilityNow);
  return {
    headerLabel: 'WHY YOU',
    sentence: stripHtml(
      `Your fit score was strongest among teammates available this week (${skillBand} skill / ${availBand} availability).`,
    ),
    confidenceClass: 'na',
  };
}
