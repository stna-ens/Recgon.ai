// Brain entry → agent_tasks row.
//
// Idempotent: each BrainEntry carries a stable dedupKey, persisted into
// source_ref so the unique partial index `uq_agent_tasks_source_ref` rejects
// duplicates. createTask returns null on conflict; we count those as already-
// minted.

import { createTask, listTombstonedDedupKeys } from './storage';
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
  for (const entry of snapshot.entries) {
    if (tombstoned.has(`${entry.kind}::${entry.dedupKey}`)) {
      skipped++;
      continue;
    }
    const task = await createTask({
      teamId,
      projectId: entry.projectId ?? null,
      title: entry.title,
      description: entry.description,
      kind: entry.kind,
      source: entry.source,
      sourceRef: { ...entry.sourceRef, dedupKey: entry.dedupKey },
      requiredSkills: entry.requiredSkills,
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
// brain; they're inserted directly with source='user'.
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
  const task = await createTask({
    teamId: input.teamId,
    projectId: input.projectId ?? null,
    title: input.title,
    description: input.description ?? '',
    kind: input.kind,
    source: 'user',
    sourceRef: {},
    requiredSkills: input.requiredSkills ?? [],
    priority: input.priority ?? 2,
    estimatedHours: input.estimatedHours ?? 1,
    deadline: input.deadline ?? null,
    createdBy: input.createdBy,
  });
  if (!task) throw new Error('mintUserTask returned null (unexpected on user source)');
  return task;
}
