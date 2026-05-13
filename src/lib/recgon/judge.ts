// Phase 3 Plan 01 — LLM judgment overlay (pure module).
//
// This file ships ONLY the standalone judge engine. No dispatcher wiring,
// no DB writes, no Supabase, no caching layer — those land in Plan 02.
//
// `runJudgment(inputs, opts)` is the single entry point:
//   - Takes a batch of anonymized close-call tasks (each with the math top-3
//     candidates as candidate_1 / candidate_2 / candidate_3 — NO names ever).
//   - Calls the injected `chat` adapter (in production: `chatViaProviders`)
//     at temperature=0 with the JUDGE_ASSIGNMENT_BATCH prompt + JSON mode.
//   - Validates the response with `JudgeResultSchema` (Zod) AND a post-hoc
//     content validator that catches hallucinated facts (uncited skills,
//     over-cited counts, pronouns, cross-candidate references).
//   - Throws `JudgeError` on ANY failure so the caller can do math fallback
//     (JUDGE-05). The caller logs + silently falls back; no user-visible error.
//
// Also exports `computeJudgeCacheKey` — the deterministic key spec from
// JUDGE-09 that Plan 02's cache will consume.

import {
  JudgeResultSchema,
  type JudgePick,
  type JudgeResult,
} from '../schemas';
import {
  JUDGE_ASSIGNMENT_BATCH_SYSTEM,
  buildJudgeBatchUserPrompt,
} from '../prompts';
import type { JudgeCandidateInput, JudgeTaskInput } from './types';

// ── Constants ──────────────────────────────────────────────────────────────

// Default in-call timeout. Vercel functions cap at 10s for interactive
// routes; cron paths have more headroom but the judge always runs inline
// with the dispatch cron so 10s is the operative budget. Plan 02 may
// override via opts.
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Close-call detection threshold for the dispatcher's 3-pass restructure.
 *
 * When `ranked[0].score - ranked[1].score < CLOSE_CALL_THRESHOLD`, the
 * dispatcher invokes the judge; otherwise it assigns math top-1 directly.
 *
 * Locked at 0.20 per RESEARCH Q1 sub-note and CONTEXT D-30 (v3 priority is
 * quality > cost — see memory `project_quality_over_cost_v3`). This
 * supersedes the 0.15 value in ROADMAP §Phase 3 and JUDGE-01:
 *   - 0.15 was cost-driven (catch fewer LLM calls; ~50% of tasks).
 *   - 0.20 catches more meaningful tiebreakers (~70% of tasks) at
 *     ~$0.001/dispatch — well under any reasonable budget at the cap.
 *
 * Beyond 0.20 the math signal is genuinely weak and the LLM is guessing
 * as much as reasoning — research recommended stopping here.
 */
export const CLOSE_CALL_THRESHOLD = 0.20;

// Deny-list of pronouns the LLM is told NOT to use. Whole-word match,
// case-insensitive. Used both for the judge response and as defense-in-depth
// when copy is rendered for the "Why you" line.
const PRONOUN_DENY = /\b(he|she|they|him|her|them|his|hers|theirs)\b/i;

// Cross-candidate reference pattern. The prompt tells the LLM to address the
// chosen candidate directly ("you finished..."), not to compare candidates
// by id ("candidate_2 has..."). We reject any mention of candidate_N.
const CROSS_CANDIDATE_REF = /candidate_\s*\d+/i;

// Number-word vocabulary used by the over-cited-count check on
// `recent_track_record`. The LLM is told to cite a number of tasks; we
// check that the cited number is ≤ the actual `recentTasks.length`.
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const NUMBER_TOKEN = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi;

// ── Adapter shape ──────────────────────────────────────────────────────────
//
// The judge module is pure: it doesn't import `chatViaProviders` directly.
// The caller injects the adapter so unit tests can swap in a stub and so
// the bias-regression test (Plan 04) can flip between stub and real LLM via
// an env gate. Signature matches `chatViaProviders(systemPrompt, userPrompt,
// options?)` in src/lib/llm/providers.ts.
export type JudgeChatAdapter = (
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    taskKind?: string;
  },
) => Promise<string>;

export type RunJudgmentOptions = {
  chat: JudgeChatAdapter;
  timeoutMs?: number;
};

// ── Error type ─────────────────────────────────────────────────────────────

/**
 * Thrown for any judge failure — malformed JSON, schema violation, post-hoc
 * content rejection. The caller (Plan 02 dispatcher) catches this and falls
 * back to math-only assignment silently (JUDGE-05).
 */
export class JudgeError extends Error {
  readonly taskId?: string;
  readonly pickIndex?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    ctx?: { taskId?: string; pickIndex?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'JudgeError';
    this.taskId = ctx?.taskId;
    this.pickIndex = ctx?.pickIndex;
    this.cause = ctx?.cause;
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Pure batch judgment.
 *
 * @param inputs  1–10 close-call tasks, each with the anonymized top-3
 *                candidates. Caller has already pre-filtered to close-calls
 *                (math gap < threshold) and mapped real user ids to
 *                anon_id 1/2/3 BEFORE calling this function.
 * @param opts    Injected `chat` adapter + optional timeout. Tests pass a
 *                stub; production passes a `chatViaProviders` wrapper.
 *
 * @returns       Validated `JudgeResult` with one pick per task_id.
 *
 * @throws        `JudgeError` on malformed JSON, schema violation, or
 *                post-hoc content rejection. Caller catches → math fallback.
 */
export async function runJudgment(
  inputs: JudgeTaskInput[],
  opts: RunJudgmentOptions,
): Promise<JudgeResult> {
  if (inputs.length === 0) {
    throw new JudgeError('runJudgment called with empty inputs');
  }
  if (inputs.length > 10) {
    throw new JudgeError(
      `runJudgment called with ${inputs.length} inputs (max 10 — caller must chunk)`,
    );
  }

  const systemPrompt = JUDGE_ASSIGNMENT_BATCH_SYSTEM;
  const userPrompt = buildJudgeBatchUserPrompt(inputs);

  // Call the adapter. We surface any thrown error as JudgeError so the
  // caller has one exception type to catch for the math fallback path.
  let raw: string;
  try {
    raw = await opts.chat(systemPrompt, userPrompt, {
      temperature: 0,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseMimeType: 'application/json',
      taskKind: 'recgon_judge_assignment',
    });
  } catch (err) {
    throw new JudgeError('judge chat call failed', { cause: err });
  }

  // Parse JSON — tolerate markdown fences on the off chance jsonMode is
  // bypassed or a fallback provider returns wrapped output. Schema parse
  // failures throw a JudgeError with the original Zod error attached.
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
      throw new JudgeError('judge response is not valid JSON', { cause: err });
    }
  }

  let result: JudgeResult;
  try {
    result = JudgeResultSchema.parse(parsedJson);
  } catch (err) {
    throw new JudgeError('judge response failed schema validation', { cause: err });
  }

  // Post-hoc content validation — one pick at a time, matched up to its
  // task input by `task_id`. This is where we catch hallucinated facts.
  for (let i = 0; i < result.picks.length; i++) {
    const pick = result.picks[i];
    const taskInput = inputs.find((t) => t.taskId === pick.task_id);
    if (!taskInput) {
      throw new JudgeError(
        `pick references unknown task_id '${pick.task_id}' (not in inputs)`,
        { pickIndex: i },
      );
    }
    validateJudgePick(pick, taskInput, i);
  }

  // Exactly one pick per task_id rule (mirror of the prompt's "Do not skip,
  // do not add"). Both directions: every input must have a pick, and we've
  // already rejected unknown task_ids above.
  const pickedIds = new Set(result.picks.map((p) => p.task_id));
  for (const t of inputs) {
    if (!pickedIds.has(t.taskId)) {
      throw new JudgeError(`judge skipped task_id '${t.taskId}'`, { taskId: t.taskId });
    }
  }
  if (result.picks.length !== inputs.length) {
    throw new JudgeError(
      `judge returned ${result.picks.length} picks for ${inputs.length} tasks`,
    );
  }

  return result;
}

// ── Post-hoc content validator ─────────────────────────────────────────────

/**
 * Validate a single pick against its task input. Throws `JudgeError` on
 * any rejection. Checks (in order):
 *
 *   1. chosen_candidate_id index is in range for this task's candidates
 *      (Zod literal union already enforces ∈ {1,2,3}; this catches the
 *      "task only has 2 candidates" edge case).
 *   2. No pronouns in `reason_sentence` (T-03-01-03).
 *   3. No cross-candidate reference like `candidate_2`.
 *   4. Per-reason_code substring/count checks:
 *      - `skill_depth` → at least one of `chosen.confirmedSkills` appears
 *        whole-word in the sentence.
 *      - `recent_track_record` → any cited count is ≤ `recentTasks.length`.
 *      - `interest_match` → at least one of `chosen.interests` appears
 *        whole-word in the sentence.
 *
 * Exported for direct testing and (eventually) for Plan 02 if it wants to
 * re-run validation on cached results.
 */
export function validateJudgePick(
  pick: JudgePick,
  task: JudgeTaskInput,
  pickIndex: number = 0,
): void {
  // 1. Index range. Zod has already ensured chosen ∈ {1,2,3}; here we just
  //    catch the case where the input only had 2 candidates and the LLM
  //    picked candidate_3.
  if (pick.chosen_candidate_id > task.candidates.length) {
    throw new JudgeError(
      `chosen_candidate_id=${pick.chosen_candidate_id} exceeds candidates.length=${task.candidates.length}`,
      { taskId: task.taskId, pickIndex },
    );
  }
  const chosen: JudgeCandidateInput = task.candidates[pick.chosen_candidate_id - 1];
  const sentence = pick.reason_sentence;
  const sentenceLower = sentence.toLowerCase();

  // 2. Pronoun deny-list.
  if (PRONOUN_DENY.test(sentence)) {
    throw new JudgeError(
      `reason_sentence contains a pronoun: '${sentence}'`,
      { taskId: task.taskId, pickIndex },
    );
  }

  // 3. Cross-candidate reference.
  if (CROSS_CANDIDATE_REF.test(sentence)) {
    throw new JudgeError(
      `reason_sentence references another candidate by id: '${sentence}'`,
      { taskId: task.taskId, pickIndex },
    );
  }

  // 4. Per-reason-code content checks.
  switch (pick.reason_code) {
    case 'skill_depth': {
      const cited = chosen.confirmedSkills.some((skill) =>
        wholeWordContains(sentenceLower, skill.toLowerCase()),
      );
      if (!cited) {
        throw new JudgeError(
          `skill_depth reason cites no skill from confirmedSkills [${chosen.confirmedSkills.join(', ')}]: '${sentence}'`,
          { taskId: task.taskId, pickIndex },
        );
      }
      break;
    }

    case 'recent_track_record': {
      const maxAllowed = chosen.recentTasks.length;
      const tokens = sentence.match(NUMBER_TOKEN);
      if (tokens) {
        for (const tok of tokens) {
          const n = parseNumberToken(tok);
          if (n !== null && n > maxAllowed) {
            throw new JudgeError(
              `recent_track_record reason cites '${tok}' (=${n}) but recentTasks has only ${maxAllowed} entries: '${sentence}'`,
              { taskId: task.taskId, pickIndex },
            );
          }
        }
      }
      break;
    }

    case 'interest_match': {
      if (chosen.interests.length === 0) {
        // Can't possibly cite an interest if the candidate has none.
        throw new JudgeError(
          `interest_match reason given but candidate has no interests: '${sentence}'`,
          { taskId: task.taskId, pickIndex },
        );
      }
      const cited = chosen.interests.some((iv) =>
        wholeWordContains(sentenceLower, iv.toLowerCase()),
      );
      if (!cited) {
        throw new JudgeError(
          `interest_match reason cites no interest from [${chosen.interests.join(', ')}]: '${sentence}'`,
          { taskId: task.taskId, pickIndex },
        );
      }
      break;
    }

    // `task_kind_familiarity` and `capacity_headroom` rely on the
    // breakdown bands the LLM already saw in the prompt; we don't try to
    // re-derive band-membership at validation time. Defense is the schema
    // (reason_code enum) + the pronoun/cross-ref/length checks above.
    case 'task_kind_familiarity':
    case 'capacity_headroom':
      break;
  }
}

// ── Cache key (consumed by Plan 02) ────────────────────────────────────────

/**
 * Compute the deterministic cache key for a single task's judgment per
 * JUDGE-09: `(taskId, sorted-candidateIds, mathScoresHash)`. Sort order
 * makes the key independent of the order candidates were passed in.
 *
 * The `mathScoresHash` is whatever opaque digest the caller (Plan 02)
 * derives from the candidate `(score, breakdown)` tuples — its job, not
 * this module's. Plan 02 owns the rule that the same math output → same
 * cache key, and the hash type stays a string here so we can swap the
 * digest algorithm later without breaking signatures.
 */
export function computeJudgeCacheKey(
  taskId: string,
  candidateUserIds: string[],
  mathScoresHash: string,
): string {
  const sorted = [...candidateUserIds].sort();
  return `${taskId}|${sorted.join(',')}|${mathScoresHash}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function wholeWordContains(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  // Escape regex metacharacters in the needle (skill tags can contain dots,
  // hyphens, plusses — e.g. `next.js`, `c++`).
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-boundary match. Skill tags with non-word chars use a looser
  // boundary so `next.js` matches inside `your next.js skill`.
  const re = new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, 'i');
  return re.test(haystack);
}

function parseNumberToken(tok: string): number | null {
  const lower = tok.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  const n = parseInt(tok, 10);
  return Number.isFinite(n) ? n : null;
}
