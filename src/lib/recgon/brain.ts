// Recgon Brain — aggregates "what needs doing" across all projects in a team.
//
// Slice 1 reads two existing sources:
//   • prioritizedNextSteps (per project) → 'next_step' tasks for strategy_lead
//   • developerPrompts (per feedback analysis) → 'dev_prompt' for dev_coach
//
// Completion is honoured: nextStepsTaken[].taken and completedPrompts[] mean
// the entry should not be re-minted.
//
// Slice 2/3 will extend this with analytics anomalies + scheduled triggers +
// teammate-generated follow-ups.

import { getAllProjects } from '../storage';
import type { Project, FeedbackAnalysis, ProductAnalysis } from '../storage';
import type { BrainEntry, BrainSnapshot, TaskKind } from './types';

function dedupKey(parts: string[]): string {
  return parts.join('|');
}

function nextStepsFromProject(project: Project): BrainEntry[] {
  const analysis = project.analysis;
  if (!analysis?.prioritizedNextSteps?.length) return [];
  const taken = new Set(
    (analysis.nextStepsTaken ?? [])
      .filter((s) => s.taken)
      .map((s) => s.step),
  );
  const entries: BrainEntry[] = [];
  analysis.prioritizedNextSteps.forEach((step, idx) => {
    if (!step || taken.has(step)) return;
    entries.push({
      dedupKey: dedupKey(['ns', project.id, String(idx), step.slice(0, 40)]),
      kind: 'next_step',
      source: 'brain',
      sourceRef: { kind: 'next_step', projectId: project.id, index: idx, step },
      title: step.length > 80 ? step.slice(0, 77) + '…' : step,
      description: step,
      requiredSkills: ['strategy', 'next_step', 'product'],
      priority: idx < 3 ? 1 : 2, // top 3 are p1, rest p2
      estimatedHours: 2,
      projectId: project.id,
    });
  });
  return entries;
}

function devPromptsFromProject(project: Project): BrainEntry[] {
  const feedbackAnalyses = project.feedbackAnalyses ?? [];
  const entries: BrainEntry[] = [];
  for (const fa of feedbackAnalyses) {
    if (!fa.developerPrompts?.length) continue;
    const completedIdx = new Set(
      (fa.completedPrompts ?? []).map((c) => c.promptIndex),
    );
    fa.developerPrompts.forEach((prompt, idx) => {
      if (!prompt || completedIdx.has(idx)) return;
      entries.push({
        dedupKey: dedupKey(['dp', fa.id, String(idx)]),
        kind: 'dev_prompt',
        source: 'brain',
        sourceRef: {
          kind: 'dev_prompt',
          projectId: project.id,
          feedbackAnalysisId: fa.id,
          index: idx,
          prompt,
        },
        title: prompt.length > 80 ? prompt.slice(0, 77) + '…' : prompt,
        description: prompt,
        requiredSkills: ['code', 'engineering', 'dev_prompt'],
        priority: 2,
        estimatedHours: 3,
        projectId: project.id,
      });
    });
  }
  return entries;
}

export async function readUnifiedBrain(teamId: string): Promise<BrainSnapshot> {
  const projects = await getAllProjects(teamId);
  const entries: BrainEntry[] = [];
  for (const p of projects) {
    entries.push(...nextStepsFromProject(p));
    entries.push(...devPromptsFromProject(p));
  }

  const byKind: Record<TaskKind, number> = {
    next_step: 0,
    dev_prompt: 0,
    marketing: 0,
    analytics: 0,
    research: 0,
    custom: 0,
  };
  entries.forEach((e) => {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  });

  return {
    computedAt: new Date().toISOString(),
    totalEntries: entries.length,
    byKind,
    entries,
  };
}

// Exported for tests so they can build entries without hitting Supabase.
export const __testing = { nextStepsFromProject, devPromptsFromProject };

export type { Project, ProductAnalysis, FeedbackAnalysis };
