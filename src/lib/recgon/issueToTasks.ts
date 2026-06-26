// quick-260626-mkn — Issue → tasks conversion engine.
//
// A teammate files an issue; Recgon breaks it into 1-or-many right-sized tasks
// (ONE LLM call), mints them with source='issue' reusing the brain mint→dispatch
// pipeline, links each task back to its issue via source_ref={issueId,index},
// and runs dispatch. Runs ALONGSIDE the brain — nothing here touches brain
// readers.
//
// FAIL-SOFT is the contract: if the breakdown LLM throws or returns junk, the
// issue still yields EXACTLY ONE task (the issue itself). An issue is never lost.
//
// Purity rule (mirrors taskSummaries.ts / judge.ts): this module does NOT import
// the LLM SDK, the dispatcher, the mint pipeline, or storage at the top level.
// The default chat adapter + the side-effecting deps are loaded lazily inside
// the functions, so a unit test that imports `breakDownIssue` / `buildIssueEntries`
// never drags supabase or the provider chain into module-load.

import { ISSUE_BREAKDOWN_SYSTEM, issueBreakdownUserPrompt } from '../prompts';
import type { OutputLanguage } from '../prompts';
import { IssueBreakdownResponseSchema, parseAIResponse } from '../schemas';
import { stripMd } from '../strings';
import { logger } from '../logger';
import type { BrainEntry, TaskKind } from './types';

// Off the interactive request path is NOT true here — conversion runs inline on
// POST — but it is one Gemini Flash call (consistent with mintUserTask's inline
// skill-tag). A tight ceiling keeps a slow LLM from holding the submit open;
// fail-soft on timeout yields the single-task fallback.
const DEFAULT_TIMEOUT_MS = 15_000;

const FALLBACK_KIND: TaskKind = 'custom';
const FALLBACK_PRIORITY = 2;
const FALLBACK_HOURS = 1;

export type IssueLike = {
  id: string;
  title: string;
  description: string;
};

export type IssueBreakdownTask = {
  title: string;
  description: string;
  kind: TaskKind;
  priority: number;
  estimatedHours: number;
};

// Same signature shape as chatViaProviders (src/lib/llm/providers.ts). Injecting
// the adapter keeps this module pure + unit-testable.
export type BreakdownChatAdapter = (
  systemPrompt: string,
  userPrompt: string,
  options?: {
    temperature?: number;
    timeoutMs?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    taskKind?: string;
  },
) => Promise<string>;

export type BreakDownIssueOptions = {
  language?: OutputLanguage;
  chat?: BreakdownChatAdapter;
  timeoutMs?: number;
};

// The single-task fallback: the issue itself becomes one task. Used whenever the
// breakdown LLM throws, returns malformed JSON, or fails schema. An issue is
// NEVER lost.
function fallbackSingleTask(issue: IssueLike): IssueBreakdownTask[] {
  return [
    {
      title: stripMd(issue.title).slice(0, 200) || 'Untitled issue',
      description: stripMd(issue.description ?? ''),
      kind: FALLBACK_KIND,
      priority: FALLBACK_PRIORITY,
      estimatedHours: FALLBACK_HOURS,
    },
  ];
}

/**
 * Ask Recgon to break an issue into the fewest clearly-scoped tasks (1 if
 * atomic, never more than 8). FAIL-SOFT: on ANY error (adapter throw, malformed
 * JSON, schema reject) returns a single task derived from the issue itself, so
 * the caller always has at least one task to mint. NEVER throws.
 */
export async function breakDownIssue(
  issue: IssueLike,
  opts: BreakDownIssueOptions = {},
): Promise<IssueBreakdownTask[]> {
  try {
    const chat = opts.chat ?? (await getDefaultChatAdapter());
    const userPrompt = issueBreakdownUserPrompt(
      issue.title,
      issue.description ?? '',
      opts.language,
    );
    const raw = await chat(ISSUE_BREAKDOWN_SYSTEM, userPrompt, {
      temperature: 0.2,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      responseMimeType: 'application/json',
      taskKind: 'recgon_issue_breakdown',
    });
    const parsed = parseAIResponse(raw, IssueBreakdownResponseSchema);
    const tasks = parsed.tasks.map<IssueBreakdownTask>((t) => ({
      title: stripMd(t.title).slice(0, 200),
      description: stripMd(t.description ?? ''),
      kind: t.kind,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
    }));
    // Schema guarantees .min(1), but guard defensively against an empty list.
    return tasks.length > 0 ? tasks : fallbackSingleTask(issue);
  } catch (err) {
    logger.warn('breakDownIssue: breakdown failed — falling back to single task', {
      issueId: issue.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return fallbackSingleTask(issue);
  }
}

/**
 * Pure mapper: breakdown tasks → BrainEntry[] for the mint pipeline. Each entry
 * carries source='issue', projectId=null, a stable dedupKey `issue|<id>|<index>`
 * and sourceRef={issueId,index} so re-running conversion never double-mints
 * (the unique source_ref index rejects the duplicate). requiredSkills is left
 * empty — the mint pipeline's skill-tagger fills it from title+description.
 */
export function buildIssueEntries(
  issue: IssueLike,
  tasks: IssueBreakdownTask[],
): BrainEntry[] {
  return tasks.map((t, index) => ({
    dedupKey: `issue|${issue.id}|${index}`,
    kind: t.kind,
    source: 'issue',
    sourceRef: { issueId: issue.id, index },
    title: t.title,
    description: t.description,
    requiredSkills: [],
    priority: t.priority,
    estimatedHours: t.estimatedHours,
    projectId: null,
    deadline: null,
  }));
}

/**
 * Convert a stored issue into tasks, inline:
 *   1. load the issue, mark it 'converting'
 *   2. break it down (fail-soft → ≥1 task)
 *   3. mint via mintTasksFromIssue (reuses the brain skill-tag → create →
 *      summarize pipeline), source='issue'
 *   4. mark the issue 'converted' with the task count
 *   5. fire-and-forget runDispatch so the spawned tasks get assigned
 *
 * Returns the number of tasks the issue maps to (stable across re-runs — the
 * intended count, not the freshly-inserted count, so an idempotent re-run that
 * dedups everything doesn't zero out task_count).
 */
export async function convertIssueToTasks(
  issueId: string,
  opts: BreakDownIssueOptions = {},
): Promise<{ taskCount: number }> {
  const {
    getIssue,
    updateIssueStatus,
  } = await import('../issueStorage');

  const issue = await getIssue(issueId);
  if (!issue) throw new Error(`convertIssueToTasks: issue ${issueId} not found`);

  await updateIssueStatus(issueId, 'converting');

  const breakdown = await breakDownIssue(
    { id: issue.id, title: issue.title, description: issue.description },
    opts,
  );
  const entries = buildIssueEntries(
    { id: issue.id, title: issue.title, description: issue.description },
    breakdown,
  );

  // task_count = number of tasks the issue maps to (entries.length), which is
  // stable across an idempotent re-run where mint dedups everything.
  const taskCount = entries.length;

  try {
    const { mintTasksFromIssue } = await import('./taskMint');
    await mintTasksFromIssue(issue.teamId, entries, { language: opts.language });
    await updateIssueStatus(issueId, 'converted', taskCount);
  } catch (err) {
    // A mint/DB failure must NEVER strand the issue in 'converting' (which the
    // panel renders as "splitting…" forever). Reset to 'open' so it reads as
    // awaiting conversion, then rethrow so the route surfaces the warning.
    await updateIssueStatus(issueId, 'open').catch(() => {});
    throw err;
  }

  // Fire-and-forget dispatch (same pattern as workers.ts post-analysis hook).
  // Assignment is best-effort; the daily cron catches anything this misses.
  const { runDispatch } = await import('./dispatcher');
  runDispatch(issue.teamId).catch((err) => {
    logger.warn('convertIssueToTasks: post-conversion dispatch failed (non-fatal)', {
      teamId: issue.teamId,
      issueId,
      err: err instanceof Error ? err.message : String(err),
    });
  });

  return { taskCount };
}

// ── Lazy default chat adapter ──────────────────────────────────────────────
// Defer importing ../llm/providers until first production use so unit tests
// that inject opts.chat never pull in the LLM SDK at module-load.
let cachedDefaultChat: BreakdownChatAdapter | null = null;

async function getDefaultChatAdapter(): Promise<BreakdownChatAdapter> {
  if (cachedDefaultChat) return cachedDefaultChat;
  const providers = await import('../llm/providers');
  cachedDefaultChat = providers.chatViaProviders;
  return cachedDefaultChat;
}
