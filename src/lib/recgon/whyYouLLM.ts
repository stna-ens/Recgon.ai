// Phase 3 Plan 05 — grounded "Why you" LLM call (pure module).
//
// `generateWhyYouSentence(opts)` is the new single entry point for the
// per-assignment Why-you sentence. It mirrors `runJudgment`'s shape:
//   - Pure function — no chatViaProviders import (caller injects adapter).
//   - On ANY failure (chat throws, malformed JSON, schema reject, grounding
//     validator reject) → returns {sentence:null, citedSignal:null}.
//     NEVER throws upstream — Plan 03 contract says the caller (dispatcher)
//     persists `null` on the reasoning envelope and Plan 03-06 wires the
//     null trigger to assignment refusal.
//   - Default `chat` (when caller passes none) wraps `chatViaProviders` at
//     temperature=0, timeoutMs=8000, taskKind='recgon_why_you_grounded'.
//
// The grounding validator rejects:
//   1. Sentences citing skills not present in declaredSkills.
//   2. Sentences containing pronouns (reuses PRONOUN_DENY from judge.ts).
//   3. Sentences containing candidate IDs (cross-prompt leak).
//   4. Sentences leading with availability/capacity when a fit signal exists
//      (user Hard Rule 2: "they had time" is not a reason).
//   5. Sentences > 25 words OR > 200 chars OR with angle brackets.
//
// Voice (D-21): Recgon IS the AI Product Manager — direct second-person
// address. PRONOUN_DENY is the defense-in-depth net.

import {
  WhyYouGroundedSchema,
  type WhyYouGrounded,
} from '../schemas';
import {
  WHY_YOU_GROUNDED_SYSTEM,
  buildWhyYouGroundedUserPrompt,
  type WhyYouTaskBlock,
  type WhyYouCandidateBlock,
  type WhyYouMathBreakdown,
} from '../prompts';
import { PRONOUN_DENY } from './judge';
import { chatViaProviders } from '../llm/providers';

// ── Constants ──────────────────────────────────────────────────────────────

// In-call timeout. Vercel cron paths have headroom but the dispatcher's
// per-assignment Why-you call runs inline with the dispatch loop, so 8s is
// the operative budget (matches Plan 03-01 judge timeout convention).
const DEFAULT_TIMEOUT_MS = 8_000;

// Signal floor — when a math-breakdown component is >= this, we consider it
// a "real signal" that could honestly be cited as the reason. Used by the
// grounding validator's capacity_headroom guard: if any of skillOverlap /
// fitForKind / interestNudge is >= SIGNAL_FLOOR, the LLM may NOT lead with
// availability/capacity (user Hard Rule 2 — "they had time" is not a reason).
// Mirrors the threshold whyYou.ts used pre-Plan-05 to gate the math-only
// fallback copy.
const SIGNAL_FLOOR = 0.15;

// Cross-candidate reference pattern. Defense in depth — the grounded prompt
// addresses the chosen candidate directly with "you/your", but if the model
// somehow emits `candidate_1` / `candidate 2` / `Candidate-3`, we reject.
const CANDIDATE_ID_REF = /candidate[\s_\-.]*\d+/i;

// Words signalling availability/capacity language. The validator combines
// this with SIGNAL_FLOOR to enforce user Hard Rule 2: never lead with
// "they had time" when a fit signal exists.
const AVAILABILITY_WORDS =
  /\b(capacity|week|available|availability|clearest|headroom|free|open)\b/i;

// ── Adapter shape ──────────────────────────────────────────────────────────
//
// The module is pure: it doesn't import `chatViaProviders` for use at runtime
// without an explicit caller request. The caller injects the adapter so unit
// tests swap in a stub and the bias regression (Task 4) flips between stub
// and real LLM via env gate. Signature matches `chatViaProviders` in
// src/lib/llm/providers.ts.
export type WhyYouChatAdapter = (
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    taskKind?: string;
  },
) => Promise<string>;

// ── Inputs / Outputs ───────────────────────────────────────────────────────

export type GenerateWhyYouOpts = {
  task: WhyYouTaskBlock;
  candidate: WhyYouCandidateBlock;
  mathBreakdown: WhyYouMathBreakdown;
  /**
   * Injected chat adapter. Default: `chatViaProviders` with temperature=0,
   * timeoutMs=8000, taskKind='recgon_why_you_grounded'. Tests pass a stub.
   */
  chat?: WhyYouChatAdapter;
  /**
   * Override the post-hoc grounding validator. Defaults to the production
   * `validateGroundedSentence` defined in this module. Tests may inject a
   * permissive validator to isolate Zod / adapter behavior.
   */
  validator?: (
    parsed: WhyYouGrounded,
    inputs: { candidate: WhyYouCandidateBlock; mathBreakdown: WhyYouMathBreakdown; task: WhyYouTaskBlock },
  ) => boolean;
  /**
   * Test-only escape hatch. The runtime call path NEVER passes identity
   * fields — they live on `Teammate` but are dropped before the candidate
   * payload is built. This option exists ONLY so the anonymization test
   * (Task 1) can assert that even when callers ATTEMPT to pass identity,
   * the prompt body never contains it. The implementation ignores the
   * field; it's accepted at the type level so the test compiles.
   */
  __testIdentity?: { name: string; email: string };
};

export type GenerateWhyYouResult = {
  sentence: string | null;
  citedSignal: WhyYouGrounded['cited_signal'];
};

// ── Default chat adapter ───────────────────────────────────────────────────

const defaultChat: WhyYouChatAdapter = (system, user, options) =>
  chatViaProviders(system, user, {
    temperature: options?.temperature ?? 0,
    timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    responseMimeType: options?.responseMimeType ?? 'application/json',
    taskKind: options?.taskKind ?? 'recgon_why_you_grounded',
  });

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Generate one grounded "Why you" sentence for a single assignment.
 *
 * Hard contract (Phase 3 Plan 05):
 *   - Returns {sentence: string, citedSignal: enum} on success.
 *   - Returns {sentence: null, citedSignal: null} on ANY failure:
 *       chat throws / malformed JSON / Zod schema reject / grounding
 *       validator reject. NEVER throws upstream.
 *   - LLM null sentence is honored verbatim (model self-refused → return null).
 *
 * The caller (Plan 03-06 dispatcher) reads `sentence === null` as the
 * trigger to treat the assignment as ungrounded (Gap 1 + Gap 2 coupled).
 */
export async function generateWhyYouSentence(
  opts: GenerateWhyYouOpts,
): Promise<GenerateWhyYouResult> {
  const chat = opts.chat ?? defaultChat;
  const validate = opts.validator ?? validateGroundedSentence;

  const systemPrompt = WHY_YOU_GROUNDED_SYSTEM;
  // Builder API does not accept identity — `__testIdentity` is intentionally
  // unused. If a caller ever tries to extend `WhyYouCandidateBlock` with a
  // name/email field, that's a type-level change reviewers must approve.
  const userPrompt = buildWhyYouGroundedUserPrompt(
    opts.task,
    opts.candidate,
    opts.mathBreakdown,
  );

  // Call the adapter. ANY throw → null result (no exception leaks).
  let raw: string;
  try {
    raw = await chat(systemPrompt, userPrompt, {
      temperature: 0,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      responseMimeType: 'application/json',
      taskKind: 'recgon_why_you_grounded',
    });
  } catch {
    return { sentence: null, citedSignal: null };
  }

  // Parse JSON — tolerate markdown fences (some providers emit them despite
  // jsonMode). On any parse failure → null result.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    try {
      parsedJson = JSON.parse(stripped);
    } catch {
      return { sentence: null, citedSignal: null };
    }
  }

  // Zod validate. Schema failure → null result (includes 30-word + 200-char
  // refines + enum check on cited_signal).
  let parsed: WhyYouGrounded;
  try {
    parsed = WhyYouGroundedSchema.parse(parsedJson);
  } catch {
    return { sentence: null, citedSignal: null };
  }

  // LLM self-refusal — model said "no signal fits" → honor verbatim.
  if (parsed.sentence === null) {
    return { sentence: null, citedSignal: null };
  }

  // Post-hoc grounding validator. Sees the candidate payload Zod can't see.
  const grounded = validate(parsed, {
    candidate: opts.candidate,
    mathBreakdown: opts.mathBreakdown,
    task: opts.task,
  });
  if (!grounded) {
    return { sentence: null, citedSignal: null };
  }

  return {
    sentence: stripHtml(parsed.sentence),
    citedSignal: parsed.cited_signal,
  };
}

// ── Post-hoc grounding validator ───────────────────────────────────────────

/**
 * Returns `true` when the LLM's sentence is genuinely grounded in the
 * candidate payload; `false` otherwise. Exported for direct testing.
 *
 * Rejection rules (in order):
 *   1. Pronoun deny-list (defense in depth — prompt forbids pronouns but
 *      we re-check at the boundary).
 *   2. Candidate-id reference (`candidate_1`, `Candidate 2`, etc.).
 *   3. Angle brackets — defense against HTML/JS injection in render paths.
 *   4. capacity_headroom path: REJECT if any fit signal (skill / kind /
 *      interest) is >= SIGNAL_FLOOR. User Hard Rule 2: never lead with
 *      "they had time" when a real fit reason exists.
 *   5. Signal-specific grounding:
 *      - skill_depth → at least one declared skill must appear (whole-word).
 *      - recent_track_record → candidate must have ≥1 recent task.
 *      - task_kind_familiarity → task.kind must appear in sentence OR
 *        at least one recent task must match task.kind.
 *      - interest_match → at least one interest must appear (whole-word)
 *        AND candidate.interests is non-empty.
 *      - capacity_headroom → availabilityNow + loadHeadroom must be the
 *        only meaningful signal (already enforced by rule 4 above).
 */
export function validateGroundedSentence(
  parsed: WhyYouGrounded,
  inputs: {
    candidate: WhyYouCandidateBlock;
    mathBreakdown: WhyYouMathBreakdown;
    task: WhyYouTaskBlock;
  },
): boolean {
  const sentence = parsed.sentence;
  if (sentence === null) return false;

  // 1. Pronoun deny-list (defense in depth alongside prompt rule).
  if (PRONOUN_DENY.test(sentence)) return false;

  // 2. Candidate-id reference (cross-prompt leak shield).
  if (CANDIDATE_ID_REF.test(sentence)) return false;

  // 3. Angle brackets (XSS belt — already caught by Zod's char/word caps
  //    but a 200-char sentence with brackets can still slip through if no
  //    refine specifically forbids them).
  if (/[<>]/.test(sentence)) return false;

  const lower = sentence.toLowerCase();
  const { candidate, mathBreakdown, task } = inputs;

  // 4. capacity_headroom availability-only rule. User Hard Rule 2: when a
  //    real fit signal exists, the LLM may NOT lead with availability.
  if (parsed.cited_signal === 'capacity_headroom') {
    const hasFitSignal =
      mathBreakdown.skillOverlap >= SIGNAL_FLOOR ||
      mathBreakdown.fitForKind >= SIGNAL_FLOOR ||
      (mathBreakdown.interestNudge ?? 0) >= SIGNAL_FLOOR;
    if (hasFitSignal) return false;
  }

  // 5. Even when the model picks a fit signal, if the sentence's only
  //    grounding is availability language AND a fit signal exists, reject
  //    (catches the case where the LLM tags reason_code='skill_depth' but
  //    the sentence body only talks about the candidate's clear week).
  if (
    parsed.cited_signal !== 'capacity_headroom' &&
    AVAILABILITY_WORDS.test(sentence) &&
    !sentenceContainsAnySkill(lower, candidate.declaredSkills) &&
    !sentenceContainsAnyInterest(lower, candidate.interests) &&
    !sentenceContainsTaskKind(lower, task.kind) &&
    !sentenceContainsRecentCountReference(lower)
  ) {
    return false;
  }

  // 6. Signal-specific grounding.
  switch (parsed.cited_signal) {
    case 'skill_depth':
      return sentenceContainsAnySkill(lower, candidate.declaredSkills);

    case 'recent_track_record':
      // Candidate must actually have recent tasks; otherwise the claim is
      // unfounded.
      return candidate.recentTasks.length > 0;

    case 'task_kind_familiarity': {
      // Either the sentence mentions the task kind explicitly OR the
      // candidate has at least one recent task matching the kind.
      const kindInSentence = sentenceContainsTaskKind(lower, task.kind);
      const recentMatchesKind = candidate.recentTasks.some(
        (r) => r.kind === task.kind,
      );
      return kindInSentence || recentMatchesKind;
    }

    case 'interest_match':
      if (candidate.interests.length === 0) return false;
      return sentenceContainsAnyInterest(lower, candidate.interests);

    case 'capacity_headroom':
      // Already filtered by rule 4 above — at this point no fit signal
      // exists, so leading with capacity is honest.
      return true;

    case null:
      return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sentenceContainsAnySkill(
  lowerSentence: string,
  skills: string[],
): boolean {
  return skills.some((s) => wholeWordContains(lowerSentence, s.toLowerCase()));
}

function sentenceContainsAnyInterest(
  lowerSentence: string,
  interests: string[],
): boolean {
  return interests.some((i) =>
    wholeWordContains(lowerSentence, i.toLowerCase()),
  );
}

function sentenceContainsTaskKind(
  lowerSentence: string,
  kind: string,
): boolean {
  return wholeWordContains(lowerSentence, kind.toLowerCase());
}

// recent_track_record: sentence should usually mention a number ("3 tasks")
// or a count word. We don't bound-check the number here (the prompt builder
// exposes recent_tasks_count to the LLM and the schema doesn't include the
// number), but we DO accept any digit/number-word as a grounding cue.
function sentenceContainsRecentCountReference(lowerSentence: string): boolean {
  return /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(
    lowerSentence,
  );
}

function wholeWordContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  // Escape regex metacharacters — skill tags can contain dots, hyphens,
  // plusses (e.g. `next.js`, `c++`).
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-boundary with a looser definition so `next.js` matches inside
  // `your next.js skill`. Mirrors the judge.ts helper.
  const re = new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i');
  return re.test(haystack);
}

function stripHtml(s: string): string {
  return s.replace(/[<>]/g, '');
}
