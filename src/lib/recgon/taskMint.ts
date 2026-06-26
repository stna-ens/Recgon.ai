// Brain entry → agent_tasks row.
//
// Idempotent: each BrainEntry carries a stable dedupKey, persisted into
// source_ref so the unique partial index `uq_agent_tasks_source_ref` rejects
// duplicates. createTask returns null on conflict; we count those as already-
// minted.
//
// Before insert we ask the LLM to tag each task with role-aware skills based
// on title + description, replacing the brain's generic per-source skills
// (e.g. "thumbs-up button" needs `engineering`, not `strategy`). On LLM
// failure we fall back to the brain's original tags so minting never blocks.

import { createTask, listTombstonedDedupKeys, setTaskShortSummary } from './storage';
import { tagTasksWithSkills, tagSingleTaskWithSkills } from './skillTagger';
import { generateTaskSummaries } from './taskSummaries';
import { logger } from '../logger';
import type { BrainEntry, BrainSnapshot, AgentTask } from './types';
import type { OutputLanguage } from '../prompts';

export type MintResult = {
  minted: AgentTask[];
  skipped: number;
};

// Shared mint body for any BrainEntry[] (brain OR issue path):
//   tagTasksWithSkills (batch) → createTask loop → generateTaskSummaries (batch).
// Each entry must already carry a stable `dedupKey` (used both as the tagger id
// and persisted into source_ref so `uq_agent_tasks_source_ref` rejects dupes —
// re-running conversion never double-mints). Returns the minted rows + a count
// of entries that hit the dedup conflict (createTask returned null).
//
// NOTE: tombstone filtering is NOT done here — it is brain-specific and stays in
// mintTasksFromBrain. mintEntries trusts its caller to pass the final entries.
async function mintEntries(
  teamId: string,
  entries: BrainEntry[],
  opts?: { language?: OutputLanguage },
): Promise<MintResult> {
  const minted: AgentTask[] = [];
  let skipped = 0;

  // Tag in one batch up front. Each entry is already keyed by `dedupKey`
  // (stable per source-ref), so we use that as the tagger id.
  const skillsByDedup = await tagTasksWithSkills(
    entries.map((entry) => ({
      id: entry.dedupKey,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      fallbackSkills: entry.requiredSkills,
    })),
  );

  for (const entry of entries) {
    const requiredSkills =
      skillsByDedup.get(entry.dedupKey) ?? entry.requiredSkills;
    const task = await createTask({
      teamId,
      projectId: entry.projectId ?? null,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      source: entry.source,
      sourceRef: { ...entry.sourceRef, dedupKey: entry.dedupKey },
      requiredSkills,
      priority: entry.priority,
      estimatedHours: entry.estimatedHours,
      deadline: entry.deadline ?? null,
      createdBy: null,
    });
    if (task) minted.push(task);
    else skipped++;
  }

  // quick-260620-mav — generate compact-UI labels in ONE batched LLM call for
  // all freshly minted tasks, then patch each row. Fully fail-soft: any error
  // is swallowed so minting never blocks. title/description are untouched.
  if (minted.length > 0) {
    try {
      const summaries = await generateTaskSummaries(
        minted.map((t) => ({ title: t.title, description: t.description })),
        { language: opts?.language },
      );
      for (let i = 0; i < minted.length; i++) {
        const summary = summaries[i];
        if (summary) {
          await setTaskShortSummary(minted[i].id, summary);
          minted[i].shortSummary = summary;
        }
      }
    } catch (err) {
      logger.warn('mintEntries: short-summary generation failed (non-fatal)', {
        teamId,
        count: minted.length,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { minted, skipped };
}

export async function mintTasksFromBrain(
  teamId: string,
  snapshot: BrainSnapshot,
  opts?: { language?: OutputLanguage },
): Promise<MintResult> {
  const tombstoned = await listTombstonedDedupKeys(teamId);

  const candidates = snapshot.entries.filter(
    (e) => !tombstoned.has(`${e.kind}::${e.dedupKey}`),
  );
  const tombstoneSkipped = snapshot.entries.length - candidates.length;

  const { minted, skipped } = await mintEntries(teamId, candidates, opts);
  return { minted, skipped: skipped + tombstoneSkipped };
}

// quick-260626-mkn — mint the tasks an issue was broken down into. Delegates to
// the shared `mintEntries` body so the issue path reuses the exact same
// skill-tag → create → summarize pipeline as the brain path. No tombstoning:
// issue entries carry their own stable dedupKey (issue|<issueId>|<index>) and
// the unique source_ref index is the dedup guarantee.
export async function mintTasksFromIssue(
  teamId: string,
  entries: BrainEntry[],
  opts?: { language?: OutputLanguage },
): Promise<MintResult> {
  return mintEntries(teamId, entries, opts);
}

// Convenience for the user-created path. Manual tasks don't go through the
// brain; they're inserted directly with source='user'. We still tag with the
// LLM so the matcher gets a usable skill signal — unless the caller passed
// explicit skills, which we trust.
export async function mintUserTask(input: {
  teamId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  kind: BrainEntry['kind'];
  requiredSkills?: string[];
  priority?: number;
  estimatedHours?: number;
  deadline?: string | null;
  createdBy: string;
}): Promise<AgentTask> {
  let requiredSkills = input.requiredSkills ?? [];
  if (requiredSkills.length === 0) {
    requiredSkills = await tagSingleTaskWithSkills({
      id: 'user_task',
      title: input.title,
      description: input.description ?? '',
      kind: input.kind,
      fallbackSkills: [],
    });
  }
  const task = await createTask({
    teamId: input.teamId,
    projectId: input.projectId ?? null,
    title: input.title,
    description: input.description ?? '',
    kind: input.kind,
    source: 'user',
    sourceRef: {},
    requiredSkills,
    priority: input.priority ?? 2,
    estimatedHours: input.estimatedHours ?? 1,
    deadline: input.deadline ?? null,
    createdBy: input.createdBy,
  });
  if (!task) throw new Error('mintUserTask returned null (unexpected on user source)');
  return task;
}
