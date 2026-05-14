// Phase 3 Plan 05 — "Why you" copy renderer (LLM-grounded).
//
// Single source of truth for the one-line explanation that surfaces in:
//   1. The assignment email (`notifyTeammateAssigned` in notifications.ts)
//   2. The task pop-up (`TaskDetailPanel.tsx`)
//   3. The API response (`/api/recgon/tasks/[id]/route.ts`, privacy-filtered)
//
// Voice (D-21): Recgon IS the AI Product Manager — direct second-person
// address ("you finished 3 tasks…"), not "the AI says".
//
// Privacy: this module is pure. The viewer-role privacy filter lives at the
// API boundary (`route.ts` strips `whyYouSentence` for non-assignees); the
// renderer itself doesn't know who's reading.
//
// ─────────────────────────────────────────────────────────────────────────
// Phase 3 Plan 05 (Gap-2 closure) — rewrite as ASYNC LLM-grounded renderer:
//
//   - The math-only template path (MATH_SIGNAL_COPY, renderMathOnly,
//     SIGNAL_FLOOR strongest-signal logic) is DELETED. Live UAT confirmed
//     it reads as the system grading the teammate rather than a PM citing
//     real evidence ("Your background matches what this task needs" was
//     too generic).
//
//   - llm_tiebreaker path: UNCHANGED — runJudgment already produced a
//     grounded sentence with a reason_code; we keep using that. Don't
//     re-call the LLM if the judge already produced grounded copy.
//
//   - math_only path: now goes through `generateWhyYouSentence` (Plan 05's
//     new grounded LLM call). Cheap-fast-path: if the dispatcher already
//     pre-rendered the sentence and stuffed `reasoning.whyYouSentence` on
//     the envelope, we return that directly with NO new LLM call. This is
//     how Phase 3 keeps cost bounded — one LLM call per assignment at
//     dispatch time, not per render at every API read.
//
//   - When the LLM cannot ground the sentence (validator rejects / null
//     return / cap exhausted), `whyYouSentence` is null on the envelope.
//     The renderer returns `{sentence: null, ...}` and Plan 03-06 wires
//     the null trigger to assignment refusal.

import type { AssignmentReasoning } from './types';
import {
  generateWhyYouSentence,
  type WhyYouChatAdapter,
} from './whyYouLLM';

export type WhyYouOutput = {
  // Locale-stable label for now. The eyebrow heading on TaskDetailPanel
  // uses `recgon-label` styling — see CONTEXT D-29 mock.
  headerLabel: string;
  // The one-line explanation. ≤ ~200 chars after rendering; ≤ 25 words for
  // LLM-sourced sentences (enforced upstream by WhyYouGroundedSchema /
  // JudgePickSchema). NULL means the LLM could not ground the sentence
  // (or the cap was exhausted). Plan 03-06 turns NULL into "no grounded
  // reason → refuse the assignment" upstream of this renderer.
  sentence: string | null;
  // 'na' for math-only assignments (confidence has no meaning when no LLM
  // judgment was invoked). 'low'/'medium'/'high' for llm_tiebreaker.
  confidenceClass: 'low' | 'medium' | 'high' | 'na';
};

// ── Reason-code template table (llm_tiebreaker path) ───────────────────────
//
// One template per `reason_code` value. The judge `reason_sentence` is
// inserted VERBATIM after the header. Adding a new reason_code? Add a row
// here AND update the REASON_CODES enum in schemas.ts.

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
// the DOM render path; this also defends the plain-text email path.

function stripHtml(s: string): string {
  return s.replace(/[<>]/g, '');
}

// ── Renderer ───────────────────────────────────────────────────────────────

/**
 * Async, LLM-grounded renderer for the "Why you" line.
 *
 * Behaviour matrix:
 *   - llm_tiebreaker with a non-empty reason_sentence → returns
 *     "Header — judge sentence" (UNCHANGED from Plan 03-03).
 *   - llm_tiebreaker with empty reason_sentence (malformed envelope) →
 *     falls through to math_only path with whyYouSentence read.
 *   - math_only WITH pre-rendered `whyYouSentence` (dispatcher already
 *     called the LLM) → returns it verbatim; NO new LLM call.
 *   - math_only with `whyYouSentence === null` (dispatcher tried and got
 *     null) → returns {sentence: null, confidenceClass: 'na'}.
 *   - math_only with `whyYouSentence === undefined` (legacy envelope from
 *     pre-Plan-05 rows / dispatchers) → calls `generateWhyYouSentence`
 *     on-demand if a chat adapter + grounding inputs are provided via
 *     opts. If opts are missing (older callers), returns {sentence: null}.
 *
 * Cost guard: the LLM call ONLY happens when the envelope is missing a
 * pre-rendered sentence AND the caller provided grounding inputs. In
 * production the dispatcher pre-renders at assignment time so this code
 * path is mostly a stale-row fallback.
 */
export async function renderWhyYou(
  reasoning: AssignmentReasoning,
  opts?: RenderWhyYouOpts,
): Promise<WhyYouOutput> {
  // llm_tiebreaker path: keep the judge's grounded sentence verbatim.
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
    // Malformed envelope — fall through to math_only-style rendering.
  }

  // math_only path (or malformed llm_tiebreaker fallthrough): read the
  // pre-rendered sentence from the envelope, if present.
  const preRendered = reasoning.whyYouSentence;

  if (preRendered === null) {
    // Dispatcher tried the LLM and got a null result (cap exhausted /
    // grounding failed). Surface null up to the API/email so they OMIT
    // the line entirely (Plan 03-06 will wire this to refusal).
    return {
      headerLabel: 'WHY YOU',
      sentence: null,
      confidenceClass: 'na',
    };
  }

  if (typeof preRendered === 'string' && preRendered.trim().length > 0) {
    return {
      headerLabel: 'WHY YOU',
      sentence: stripHtml(preRendered),
      confidenceClass: 'na',
    };
  }

  // Envelope has no pre-rendered sentence (undefined — legacy or test
  // shape). If the caller threaded grounding inputs through `opts`, do
  // the LLM call on-demand. Otherwise return null. The runtime caller
  // (Plan 03-06 dispatcher) always pre-renders, so this path is for
  // legacy rows and the dispatcher's own first call.
  if (opts?.candidate && opts?.task) {
    const result = await generateWhyYouSentence({
      task: opts.task,
      candidate: opts.candidate,
      mathBreakdown: reasoning.mathBreakdown,
      chat: opts.chat,
    });
    if (result.sentence) {
      return {
        headerLabel: 'WHY YOU',
        sentence: stripHtml(result.sentence),
        confidenceClass: 'na',
      };
    }
    return {
      headerLabel: 'WHY YOU',
      sentence: null,
      confidenceClass: 'na',
    };
  }

  return {
    headerLabel: 'WHY YOU',
    sentence: null,
    confidenceClass: 'na',
  };
}

// ── Optional render inputs (legacy / test path) ────────────────────────────
//
// In production the dispatcher pre-renders the sentence and stuffs it on
// `reasoning.whyYouSentence` before assignTask. Callers (API route + email)
// just read it back. `RenderWhyYouOpts` is for stale rows / direct unit
// tests that want renderWhyYou to do the LLM call inline.

import type {
  WhyYouTaskBlock,
  WhyYouCandidateBlock,
} from '../prompts';

export type RenderWhyYouOpts = {
  task?: WhyYouTaskBlock;
  candidate?: WhyYouCandidateBlock;
  chat?: WhyYouChatAdapter;
};
