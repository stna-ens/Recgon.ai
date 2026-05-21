// Phase 4 Plan 01 — Personalized task framing (pure module).
//
// This file ships ONLY the standalone reframe engine. No dispatcher wiring,
// no DB writes, no Supabase — the `task_reframe` worker
// (src/lib/llm/workers.ts) is the integration layer that loads inputs from
// supabase, calls `runReframe`, and persists the sentence.
//
// `runReframe(inputs, opts)` is the single entry point:
//   - Builds the user prompt via `buildTaskReframeUserPrompt(inputs)`.
//   - Calls the injected `chat` adapter (in production: `chatViaProviders`)
//     at temperature=0 with the TASK_REFRAME prompt + JSON mode.
//   - Validates the response with `ReframeResultSchema` (Zod) + a post-hoc
//     TONE validator (FRAME-06: no flattery, no shared-history phrases,
//     no pronouns) + a post-hoc GROUNDING validator (FRAME-07: no inferred
//     facts — every cited signal must trace back to declaredSkills,
//     declaredInterests, recentProjectState, or the Phase 3 reason_code).
//   - Throws `ReframeError` with one of four `kind`s so the worker layer
//     can distinguish retry semantics:
//       * `llm_failure`       → upstream chat call threw (retry via jobQueue)
//       * `schema_reject`     → malformed JSON or shape (retry — LLM noise)
//       * `tone_reject`       → FRAME-06 violation (retry — LLM noise)
//       * `grounding_reject`  → FRAME-07 violation (retry — LLM noise)
//
// Purity rule: this module does NOT import `chatViaProviders` at the
// top level. The default chat adapter is constructed lazily inside
// `runReframe` only when `opts.chat` is undefined, so module-load never
// drags the LLM SDK into a unit test.

import { z } from 'zod';

import {
  ReframeResultSchema,
  RHETORICAL_MOVES,
} from '../schemas';
import {
  TASK_REFRAME_SYSTEM,
  buildTaskReframeUserPrompt,
  RHETORICAL_MOVES_WHITELIST,
} from '../prompts';
import { PRONOUN_DENY } from './judge';
import type { AssignmentReasoning } from './types';

// ── Constants ──────────────────────────────────────────────────────────────

// Default in-call timeout. Reframe runs from the cron drain (not from the
// interactive request), so 10s is the conservative ceiling. Plan 02 may
// override via opts if a downstream call wants a tighter SLA.
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Re-export the whitelist for tests and worker-layer callers that want
 * defense-in-depth validation. Frozen via `as const` upstream so the
 * tuple identity is stable across imports.
 */
export { RHETORICAL_MOVES_WHITELIST };

/**
 * Re-export the fire-and-forget `task_reframe` enqueue helper.
 *
 * The actual definition lives in `./reframeEnqueue` (a leaf module) to
 * avoid an import cycle: `storage.ts → reframe.ts → storage.ts`. Storage
 * needs the helper to invalidate + re-enqueue on `reassignTask`, and
 * `reframeEnqueue.ts` is the only file that imports `getTeammate` from
 * storage so the cycle stops there.
 *
 * Callers that historically import from `./reframe` (dispatcher) keep
 * working unchanged thanks to this re-export.
 */
export { enqueueReframeJob } from './reframeEnqueue';

/**
 * Forbidden flattery / over-enthusiastic vocabulary. Whole-word match,
 * case-insensitive. Triggers `tone_reject` (FRAME-06).
 *
 * Scope: the words an LLM picks when sycophancy slips through the prompt
 * guardrails. We deliberately keep this short and high-precision —
 * accidentally rejecting a benign use of "love" is preferable to letting
 * "you're going to love this" through. False positives surface as job
 * retries, not user-visible failures (worker fails-soft after max_attempts).
 *
 * Alphabetized for readability. Phase 4 follow-up (Fix 4) added: stellar,
 * incredible, outstanding(ly), exceptional(ly), terrific(ally), superb(ly),
 * marvelous(ly), wonderful(ly).
 */
export const FORBIDDEN_FLATTERY_WORDS =
  /\b(amazing(?:ly)?|awesome(?:ly)?|brilliant(?:ly)?|exceptional(?:ly)?|excellent(?:ly)?|fantastic(?:ally)?|great(?:ly)?|incredible|lov(?:e|ed|es|ing|ely)|marvelous(?:ly)?|outstanding(?:ly)?|perfect(?:ly)?|stellar|superb(?:ly)?|terrific(?:ally)?|wonderful(?:ly)?)\b/i;

/**
 * Forbidden shared-history / false-familiarity phrases. Case-insensitive.
 * Triggers `tone_reject` (FRAME-06). Phrases here imply Recgon knows the
 * assignee personally, which it does not.
 */
export const FORBIDDEN_FAMILIARITY_PHRASES =
  /\b(as you know|like last time|remember when|i know how)\b/i;

// ── Public types ───────────────────────────────────────────────────────────

/**
 * Rhetorical-move vocabulary — the FRAME-06 whitelist enforced by the
 * post-hoc validator. The tuple in `RHETORICAL_MOVES_WHITELIST` (prompts.ts)
 * is the runtime source of truth; this literal-union type mirrors it.
 */
export type RhetoricalMove = (typeof RHETORICAL_MOVES)[number];

/**
 * Inputs to a single reframe call. Worker layer assembles this from
 * `agent_tasks` + `teammate_profiles` + `project_analyses` before calling
 * `runReframe`.
 */
export type ReframeInputs = {
  task: {
    id: string;
    title: string;
    description: string;
    kind: string;
  };
  assignee: {
    userId: string;
    declaredSkills: string[]; // self-reported only — FRAME-07 ground truth
    declaredInterests: string[];
  };
  assignmentReasoning: AssignmentReasoning | null;
  recentProjectState: {
    recentCommitFiles?: string[];
    recentAnalyticsChange?: string;
    recentTaskTitles?: string[];
  } | null;
};

/**
 * Validated reframe output. The `sentence` is the user-facing string
 * persisted to `agent_tasks.personalized_description`. `citedMoves` +
 * `citedSignals` are kept for telemetry / debugging — they let the
 * verifier replay the post-hoc grounding check on stored output.
 */
export type ReframeResult = {
  sentence: string;
  citedMoves: RhetoricalMove[];
  citedSignals: string[];
};

/**
 * Chat adapter shape — same signature as `chatViaProviders` in
 * `src/lib/llm/providers.ts`. Injecting the adapter keeps this module pure
 * for unit tests and lets the worker layer swap in `chatViaProviders` in
 * production.
 */
export type ReframeChatAdapter = (
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    taskKind?: string;
  },
) => Promise<string>;

export type RunReframeOptions = {
  chat?: ReframeChatAdapter;
  timeoutMs?: number;
};

// ── Error type ─────────────────────────────────────────────────────────────

/**
 * Thrown for any reframe failure. Mirrors `JudgeError` (judge.ts) but
 * carries a discrete `kind` so the worker can decide retry semantics —
 * `llm_failure` is transient, `schema_reject` / `tone_reject` /
 * `grounding_reject` are LLM-noise that the exponential backoff should
 * still retry (the LLM might produce a clean response next attempt).
 */
export type ReframeErrorKind =
  | 'llm_failure'
  | 'schema_reject'
  | 'tone_reject'
  | 'grounding_reject';

export class ReframeError extends Error {
  readonly kind: ReframeErrorKind;
  readonly cause?: unknown;

  constructor(
    kind: ReframeErrorKind,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ReframeError';
    this.kind = kind;
    this.cause = cause;
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Pure single-task reframe.
 *
 * @param inputs  Task + assignee profile + (optional) Phase 3 assignment
 *                reasoning + (optional) recent project state. Worker layer
 *                assembles this from supabase before calling.
 * @param opts    Injected `chat` adapter (default: lazy-loaded
 *                `chatViaProviders`) + optional timeout. Tests inject a stub.
 *
 * @returns       Validated `ReframeResult` with the sentence + cited moves
 *                + cited signals.
 *
 * @throws        `ReframeError` on any failure. See `ReframeErrorKind`.
 */
export async function runReframe(
  inputs: ReframeInputs,
  opts: RunReframeOptions = {},
): Promise<ReframeResult> {
  const chat = opts.chat ?? (await getDefaultChatAdapter());
  const userPrompt = buildTaskReframeUserPrompt(adaptInputsForPrompt(inputs));

  // 1. Call the adapter. Any throw → llm_failure (transient retry path).
  let raw: string;
  try {
    raw = await chat(TASK_REFRAME_SYSTEM, userPrompt, {
      temperature: 0,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseMimeType: 'application/json',
      taskKind: 'recgon_task_reframe',
    });
  } catch (err) {
    throw new ReframeError('llm_failure', 'reframe chat call failed', err);
  }

  // 2. Parse JSON — tolerate markdown fences (defense against fallback
  //    providers that occasionally wrap output even with jsonMode set).
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
    } catch (err) {
      throw new ReframeError(
        'schema_reject',
        'reframe response is not valid JSON',
        err,
      );
    }
  }

  // 3. Zod schema validation — shape + length + move-enum bounds.
  let payload: z.infer<typeof ReframeResultSchema>;
  try {
    payload = ReframeResultSchema.parse(parsedJson);
  } catch (err) {
    throw new ReframeError(
      'schema_reject',
      'reframe response failed schema validation',
      err,
    );
  }

  const { sentence, cited_moves: citedMoves, cited_signals: citedSignals } =
    payload;

  // 4. Defense-in-depth move-whitelist check (Zod enum should catch this,
  //    but if the schema ever drifts the post-hoc guard still rejects).
  for (const move of citedMoves) {
    if (!RHETORICAL_MOVES_WHITELIST.includes(move)) {
      throw new ReframeError(
        'tone_reject',
        `cited_move '${move}' is not in the RHETORICAL_MOVES_WHITELIST`,
      );
    }
  }

  // 5. Post-hoc TONE validator (FRAME-06).
  // Normalize via NFKC before regex match. This catches compatibility-form
  // bypass attempts: full-width chars (ｇｒｅａｔ), ligatures (ﬁ), presentation
  // forms, super/subscripts, etc. — all collapse to their canonical letters.
  //
  // What NFKC does NOT catch: cross-script confusables like Cyrillic 'а'
  // (U+0430) → Latin 'a' (U+0061). Those are distinct characters in
  // different scripts, even though they look identical, and Unicode's
  // confusables mapping (UTS #39) lives in a separate table that we
  // deliberately do not pull in for v3 (overkill for the threat model).
  // A determined adversary can still construct a Cyrillic-letter bypass;
  // accepted limit, documented here.
  const normalizedSentence = sentence.normalize('NFKC');
  if (PRONOUN_DENY.test(normalizedSentence)) {
    throw new ReframeError(
      'tone_reject',
      `sentence contains a pronoun: '${sentence}'`,
    );
  }
  if (FORBIDDEN_FLATTERY_WORDS.test(normalizedSentence)) {
    throw new ReframeError(
      'tone_reject',
      `sentence contains forbidden flattery vocabulary: '${sentence}'`,
    );
  }
  if (FORBIDDEN_FAMILIARITY_PHRASES.test(normalizedSentence)) {
    throw new ReframeError(
      'tone_reject',
      `sentence contains forbidden shared-history phrase: '${sentence}'`,
    );
  }

  // 6. Post-hoc GROUNDING validator (FRAME-07).
  validateGrounding(sentence, citedMoves, citedSignals, inputs);

  return {
    sentence,
    citedMoves: citedMoves as RhetoricalMove[],
    citedSignals,
  };
}

// ── Post-hoc grounding validator ───────────────────────────────────────────

/**
 * Validate that every cited move + cited signal traces back to data the
 * assignee actually self-declared (FRAME-07). Throws `ReframeError(kind=
 * 'grounding_reject')` on any failure.
 *
 * Checks (in order):
 *   1. Build the union of "allowed signals" = declaredSkills ∪
 *      declaredInterests ∪ flatten(recentProjectState). Every entry in
 *      `citedSignals` must be a substring (case-insensitive) of some
 *      allowed value, OR be a substring of `task.description` /
 *      `task.title` (file paths the LLM picked off the task body are OK).
 *   2. For each move:
 *      - fit_acknowledgement: sentence must mention at least one
 *        declaredSkill OR at least one reason_code keyword from the
 *        Phase 3 assignmentReasoning (when llm_tiebreaker).
 *      - start_location: at least one cited_signal must appear in
 *        recentProjectState.recentCommitFiles OR in task.description.
 *      - recent_state_link: at least one cited_signal must match a
 *        value in recentProjectState (commit files / task titles /
 *        analytics change).
 */
function validateGrounding(
  sentence: string,
  citedMoves: ReadonlyArray<string>,
  citedSignals: ReadonlyArray<string>,
  inputs: ReframeInputs,
): void {
  const sentenceLower = sentence.toLowerCase();

  const declaredSkills = inputs.assignee.declaredSkills.map((s) => s.toLowerCase());
  const declaredInterests = inputs.assignee.declaredInterests.map((s) =>
    s.toLowerCase(),
  );
  const recentCommitFiles =
    inputs.recentProjectState?.recentCommitFiles?.map((s) => s.toLowerCase()) ??
    [];
  const recentTaskTitles =
    inputs.recentProjectState?.recentTaskTitles?.map((s) => s.toLowerCase()) ??
    [];
  const recentAnalyticsChange =
    inputs.recentProjectState?.recentAnalyticsChange?.toLowerCase() ?? null;
  const taskDescriptionLower = inputs.task.description.toLowerCase();
  const taskTitleLower = inputs.task.title.toLowerCase();

  // Reason-code keyword extracted from the Phase 3 envelope (when present).
  const reasonCode =
    inputs.assignmentReasoning &&
    inputs.assignmentReasoning.kind === 'llm_tiebreaker'
      ? inputs.assignmentReasoning.judge.reason_code
      : null;

  // 1. Every cited_signal must trace back to allowed data.
  const allowedSignalHaystack: string[] = [
    ...declaredSkills,
    ...declaredInterests,
    ...recentCommitFiles,
    ...recentTaskTitles,
    ...(recentAnalyticsChange ? [recentAnalyticsChange] : []),
  ];

  for (const signal of citedSignals) {
    const signalLower = signal.toLowerCase();
    // WR-03: require both sides to be ≥3 chars before substring overlap
    // counts as grounded. Without this, a single-character declared
    // skill/interest (e.g. legacy profile rows with skill='c') makes the
    // haystack-includes branch pass for ANY cited_signal containing that
    // letter — degrading the validator to near-zero strength.
    const inAllowed = allowedSignalHaystack.some((h) => {
      const hLower = h.toLowerCase();
      if (hLower.length < 3 || signalLower.length < 3) return false;
      return hLower.includes(signalLower) || signalLower.includes(hLower);
    });
    const inTask =
      taskDescriptionLower.includes(signalLower) ||
      taskTitleLower.includes(signalLower);
    if (!inAllowed && !inTask) {
      throw new ReframeError(
        'grounding_reject',
        `cited_signal '${signal}' not found in declaredSkills, declaredInterests, recentProjectState, or task body`,
      );
    }
  }

  // 2. Per-move grounding rules.
  for (const move of citedMoves) {
    if (move === 'fit_acknowledgement') {
      const citedSkill = declaredSkills.some((s) =>
        wholeWordContains(sentenceLower, s),
      );
      const citedReasonCode =
        reasonCode !== null && sentenceLower.includes(reasonCodeKeyword(reasonCode));
      if (!citedSkill && !citedReasonCode) {
        throw new ReframeError(
          'grounding_reject',
          `fit_acknowledgement move cites neither a declaredSkill nor the assignmentReasoning reason_code: '${sentence}'`,
        );
      }
    } else if (move === 'start_location') {
      // At least one cited_signal must appear in commit files OR task.description.
      const hasStartLocation = citedSignals.some((sig) => {
        const sigLower = sig.toLowerCase();
        return (
          recentCommitFiles.some(
            (f) => f.includes(sigLower) || sigLower.includes(f),
          ) || taskDescriptionLower.includes(sigLower)
        );
      });
      if (!hasStartLocation) {
        throw new ReframeError(
          'grounding_reject',
          `start_location move has no cited_signal that appears in recentCommitFiles or task.description: '${sentence}'`,
        );
      }
    } else if (move === 'recent_state_link') {
      const hasRecentLink = citedSignals.some((sig) => {
        const sigLower = sig.toLowerCase();
        return (
          recentCommitFiles.some(
            (f) => f.includes(sigLower) || sigLower.includes(f),
          ) ||
          recentTaskTitles.some(
            (t) => t.includes(sigLower) || sigLower.includes(t),
          ) ||
          (recentAnalyticsChange !== null &&
            (recentAnalyticsChange.includes(sigLower) ||
              sigLower.includes(recentAnalyticsChange)))
        );
      });
      if (!hasRecentLink) {
        throw new ReframeError(
          'grounding_reject',
          `recent_state_link move has no cited_signal that matches recentProjectState: '${sentence}'`,
        );
      }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Whole-word substring check, case-insensitive. Mirrors the helper in
 * `judge.ts` but kept private so reframe stays self-contained.
 */
function wholeWordContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i');
  return re.test(haystack);
}

/**
 * Map a Phase 3 `reason_code` to a keyword the LLM is likely to surface in
 * the reframed sentence. Used by the fit_acknowledgement grounding check
 * when the assignee has declaredSkills=[] but the math+judge identified
 * track-record / familiarity / interest-match / capacity reasons.
 */
function reasonCodeKeyword(reasonCode: string): string {
  switch (reasonCode) {
    case 'skill_depth':
      return 'skill';
    case 'recent_track_record':
      return 'recent';
    case 'interest_match':
      return 'interest';
    case 'task_kind_familiarity':
      return 'familiar';
    case 'capacity_headroom':
      return 'capacity';
    default:
      return reasonCode;
  }
}

/**
 * Adapt the strongly-typed `ReframeInputs` envelope into the loosely-typed
 * shape `buildTaskReframeUserPrompt` consumes. Keeps the prompt helper
 * decoupled from the Phase 3 `AssignmentReasoning` discriminated union
 * (the prompt only needs reasonCode + reasonSentence strings).
 */
function adaptInputsForPrompt(inputs: ReframeInputs): {
  task: ReframeInputs['task'];
  assignee: ReframeInputs['assignee'];
  assignmentReasoning: {
    kind: 'math_only' | 'llm_tiebreaker';
    reasonCode?: string | null;
    reasonSentence?: string | null;
  } | null;
  recentProjectState: ReframeInputs['recentProjectState'];
} {
  const reasoning = inputs.assignmentReasoning;
  let block:
    | {
        kind: 'math_only' | 'llm_tiebreaker';
        reasonCode?: string | null;
        reasonSentence?: string | null;
      }
    | null = null;
  if (reasoning) {
    if (reasoning.kind === 'llm_tiebreaker') {
      block = {
        kind: 'llm_tiebreaker',
        reasonCode: reasoning.judge.reason_code,
        reasonSentence: reasoning.judge.reason_sentence,
      };
    } else {
      block = {
        kind: 'math_only',
        reasonCode: null,
        reasonSentence: reasoning.whyYouSentence ?? null,
      };
    }
  }
  return {
    task: inputs.task,
    assignee: inputs.assignee,
    assignmentReasoning: block,
    recentProjectState: inputs.recentProjectState,
  };
}

// ── Lazy default chat adapter ──────────────────────────────────────────────
//
// Defer the import of `../llm/providers` until first use. This is what keeps
// the module "pure" in unit-test contexts: as long as every test injects
// `opts.chat`, the providers module never loads and no LLM SDK is pulled
// in. The worker layer (production) will hit this lazy path on first call.

let cachedDefaultChat: ReframeChatAdapter | null = null;

async function getDefaultChatAdapter(): Promise<ReframeChatAdapter> {
  if (cachedDefaultChat) return cachedDefaultChat;
  // Dynamic import so the providers module isn't pulled in at module-load.
  const providers = await import('../llm/providers');
  cachedDefaultChat = providers.chatViaProviders;
  return cachedDefaultChat;
}
