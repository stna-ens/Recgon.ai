// LLM skill tagger for tasks.
//
// The brain hard-codes generic skill arrays per task source ('next_step' →
// ['strategy', 'next_step', 'product'], etc.) which doesn't tell the matcher
// who should actually do the work — a "build a thumbs-up button" task is
// engineering, not strategy. This module asks the LLM to look at each task's
// title + description and emit role-aware tags that the matcher can pair
// against teammate skills/titles.
//
// Batched: one LLM call covers many tasks. On failure (LLM down, schema
// invalid, missing entries) we fall back to the original requiredSkills so
// dispatch never blocks on tagging.

import { logger } from '../logger';
import { chatViaProviders } from '../llm/providers';
import { TAG_TASK_SKILLS_SYSTEM, tagTaskSkillsUserPrompt } from '../prompts';
import { TaskSkillTagsResponseSchema, parseAIResponse } from '../schemas';

export type TaskForTagging = {
  id: string;
  title: string;
  description: string;
  kind: string;
  fallbackSkills: string[];
};

const STOPWORD_TAGS = new Set([
  'next_step',
  'strategy',
  'product',
  'review',
  'risk',
  'data',
  'general',
  'task',
  'todo',
]);

const MAX_BATCH_SIZE = 12;

function sanitizeTags(raw: string[]): string[] {
  const out = new Set<string>();
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const norm = t.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!norm || norm.length > 32) continue;
    if (STOPWORD_TAGS.has(norm)) continue;
    out.add(norm);
    if (out.size >= 5) break;
  }
  return [...out];
}

async function tagBatch(batch: TaskForTagging[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const userPrompt = tagTaskSkillsUserPrompt(
    batch.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      kind: t.kind,
    })),
  );
  const raw = await chatViaProviders(TAG_TASK_SKILLS_SYSTEM, userPrompt, {
    temperature: 0.1,
    taskKind: 'recgon_skill_tag',
    promptVersion: 'v1',
  });
  const parsed = parseAIResponse(raw, TaskSkillTagsResponseSchema);
  for (const entry of parsed.tasks) {
    const cleaned = sanitizeTags(entry.skills);
    if (cleaned.length > 0) result.set(entry.id, cleaned);
  }
  return result;
}

export async function tagTasksWithSkills(
  tasks: TaskForTagging[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (tasks.length === 0) return out;

  const batches: TaskForTagging[][] = [];
  for (let i = 0; i < tasks.length; i += MAX_BATCH_SIZE) {
    batches.push(tasks.slice(i, i + MAX_BATCH_SIZE));
  }

  const results = await Promise.allSettled(batches.map(tagBatch));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      r.value.forEach((v, k) => out.set(k, v));
    } else {
      logger.warn('recgon skill tagger batch failed', {
        batchSize: batches[i].length,
        err: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  // Fill misses with the caller's fallback so every task ends up with skills.
  for (const t of tasks) {
    if (!out.has(t.id)) out.set(t.id, t.fallbackSkills);
  }
  return out;
}

// Single-task convenience used by the manual user-task path.
export async function tagSingleTaskWithSkills(input: TaskForTagging): Promise<string[]> {
  const map = await tagTasksWithSkills([input]);
  return map.get(input.id) ?? input.fallbackSkills;
}
