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

import { createTask, listTombstonedDedupKeys } from './storage';
import { tagTasksWithSkills, tagSingleTaskWithSkills } from './skillTagger';
import type { BrainEntry, BrainSnapshot, AgentTask } from './types';

export type MintResult = {
  minted: AgentTask[];
  skipped: number;
};

export async function mintTasksFromBrain(
  teamId: string,
  snapshot: BrainSnapshot,
): Promise<MintResult> {
  const tombstoned = await listTombstonedDedupKeys(teamId);
  const minted: AgentTask[] = [];
  let skipped = 0;

  const candidates = snapshot.entries.filter(
    (e) => !tombstoned.has(`${e.kind}::${e.dedupKey}`),
  );
  skipped += snapshot.entries.length - candidates.length;

  // Tag in one batch up front. Each entry is already keyed by `dedupKey`
  // (stable per source-ref), so we use that as the tagger id.
  const skillsByDedup = await tagTasksWithSkills(
    candidates.map((entry) => ({
      id: entry.dedupKey,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      fallbackSkills: entry.requiredSkills,
    })),
  );

  for (const entry of candidates) {
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
  return { minted, skipped };
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
