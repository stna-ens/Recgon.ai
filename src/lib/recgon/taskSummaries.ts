// quick-260620-mav — batched, language-aware, fail-soft short-summary
// generator for compact UI surfaces (week-calendar chips + command-center
// decision rows).
//
// Design contract (do NOT violate):
//   - The short label is a REAL LLM-written rewrite, ~3-6 words. It is NEVER
//     produced by truncation. The <=48-char clamp below is a LAST-RESORT
//     visual safety net only — the prompt asks the LLM to stay <= ~40 chars.
//   - Batched: ONE LLM call for N tasks. Never per-task, never per-render.
//   - Fail-soft EVERYWHERE: any error (adapter throw, malformed JSON, wrong
//     array length) returns an array of N nulls. This function NEVER throws,
//     so a caller can wire it inline at task creation without risking the
//     create. Empty input returns [].
//
// Purity rule (mirrors reframe.ts): this module does NOT import
// chatViaProviders at the top level. The default chat adapter is constructed
// lazily inside the function only when opts.chat is undefined, so module-load
// never drags the LLM SDK into a unit test.

import { TASK_SUMMARIES_SYSTEM, taskSummariesUserPrompt, localeDirective } from '../prompts';
import type { OutputLanguage } from '../prompts';
import { TaskSummariesResponseSchema } from '../schemas';
import { stripMd } from '../strings';
import { logger } from '../logger';

// Off the interactive request path (runs at task-creation time), so a tight
// ceiling keeps a slow LLM from holding the create open. Fail-soft on timeout.
const DEFAULT_TIMEOUT_MS = 10_000;

// Last-resort visual clamp. The prompt targets <= ~40 chars; this only ever
// fires on an LLM that ignored the instruction. NOT the summarization
// mechanism — purely a chip-overflow guard.
const MAX_SUMMARY_CHARS = 48;

export type TaskSummaryItem = {
  title: string;
  description?: string;
};

// Same signature shape as chatViaProviders (src/lib/llm/providers.ts). Injecting
// the adapter keeps this module pure for unit tests.
export type SummaryChatAdapter = (
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    taskKind?: string;
  },
) => Promise<string>;

export type GenerateTaskSummariesOptions = {
  language?: OutputLanguage;
  chat?: SummaryChatAdapter;
  timeoutMs?: number;
};

/**
 * Generate one short label per input task in a SINGLE batched LLM call.
 *
 * @returns A `(string | null)[]` aligned 1:1 with `items` (order preserved).
 *          `null` for any task when generation failed for the whole batch, or
 *          when an individual label coerced to empty. NEVER throws.
 */
export async function generateTaskSummaries(
  items: TaskSummaryItem[],
  opts: GenerateTaskSummariesOptions = {},
): Promise<(string | null)[]> {
  if (items.length === 0) return [];

  const nulls = (): (string | null)[] => items.map(() => null);

  try {
    const chat = opts.chat ?? (await getDefaultChatAdapter());
    const systemPrompt = TASK_SUMMARIES_SYSTEM + localeDirective(opts.language);
    const userPrompt = taskSummariesUserPrompt(items);

    let raw: string;
    try {
      raw = await chat(systemPrompt, userPrompt, {
        temperature: 0,
        timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        responseMimeType: 'application/json',
        taskKind: 'recgon_task_summaries',
      });
    } catch (err) {
      logger.warn('generateTaskSummaries: chat call failed (non-fatal)', {
        count: items.length,
        err: err instanceof Error ? err.message : String(err),
      });
      return nulls();
    }

    // Parse JSON, tolerating markdown fences (fallback providers occasionally
    // wrap output even in JSON mode).
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
        logger.warn('generateTaskSummaries: response is not valid JSON (non-fatal)', {
          count: items.length,
        });
        return nulls();
      }
    }

    const result = TaskSummariesResponseSchema.safeParse(parsedJson);
    if (!result.success) {
      logger.warn('generateTaskSummaries: response failed schema (non-fatal)', {
        count: items.length,
      });
      return nulls();
    }

    const { summaries } = result.data;
    // Wrong length → fail-soft for the whole batch (we can't safely align).
    if (summaries.length !== items.length) {
      logger.warn('generateTaskSummaries: array length mismatch (non-fatal)', {
        expected: items.length,
        got: summaries.length,
      });
      return nulls();
    }

    return summaries.map((s) => cleanSummary(s));
  } catch (err) {
    // Belt-and-suspenders: nothing above should throw, but if it does, the
    // create path must still proceed with NULL summaries.
    logger.warn('generateTaskSummaries: unexpected error (non-fatal)', {
      count: items.length,
      err: err instanceof Error ? err.message : String(err),
    });
    return nulls();
  }
}

/**
 * Normalize a single raw LLM label: strip markdown, trim, drop a single
 * trailing period, clamp to MAX_SUMMARY_CHARS as a last-resort visual guard,
 * and coerce empty/whitespace to null.
 */
function cleanSummary(raw: string): string | null {
  let s = stripMd(raw).trim();
  if (!s) return null;
  // Strip exactly one trailing period (labels carry no terminal punctuation).
  s = s.replace(/\.$/, '').trim();
  if (!s) return null;
  s = clampToLength(s, MAX_SUMMARY_CHARS);
  return s.length > 0 ? s : null;
}

/**
 * Defensive word-boundary clamp. Appends the '…' glyph ONLY when text is
 * actually cut. Never the summarization mechanism — see module header.
 */
function clampToLength(text: string, max: number): string {
  if (text.length <= max) return text;
  // Reserve one char for the ellipsis glyph.
  const budget = max - 1;
  const slice = text.slice(0, budget);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

// ── Lazy default chat adapter ──────────────────────────────────────────────
// Defer importing ../llm/providers until first production use, so unit tests
// that inject opts.chat never pull in the LLM SDK at module-load.
let cachedDefaultChat: SummaryChatAdapter | null = null;

async function getDefaultChatAdapter(): Promise<SummaryChatAdapter> {
  if (cachedDefaultChat) return cachedDefaultChat;
  const providers = await import('../llm/providers');
  cachedDefaultChat = providers.chatViaProviders;
  return cachedDefaultChat;
}
