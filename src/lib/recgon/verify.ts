// Task verification worker — runs when a task hits awaiting_review.
//
// Three-tier model decided with the user:
//   1. Auto-verify from real signals — the LLM router (evidenceRouter.ts)
//      picks the best evidence source out of github_commits / ga4_metric /
//      marketing_artifacts / web_fetch / proof_writeup based on the task
//      content. Sources are pluggable (evidenceSources.ts).
//   2. Teammate-submitted proof when no signal exists or evidence is thin.
//   3. Owner override — bypasses workers entirely, handled by the override route.
//
// On a 'passed' verdict the worker also runs a quality-rating LLM pass and
// inserts an agent_task_ratings row with rater='recgon'. Owner-override tasks
// skip rating (handled at the override route, not here).

import { logger } from '../logger';
import { chatViaProviders } from '../llm/providers';
import {
  ProofPayloadSchema,
  QualityRatingSchema,
  VerificationResultSchema,
  parseAIResponse,
  type VerificationResult,
} from '../schemas';
import {
  RATE_TASK_SYSTEM,
  VERIFY_TASK_SYSTEM,
  rateTaskUserPrompt,
  verifyTaskUserPrompt,
} from '../prompts';
import {
  getTask,
  getTeammate,
  setTaskVerification,
  upsertRating,
  logEvent,
} from './storage';
import { recordRatingForLearning } from './learn';
import { recordSkillRating } from './fitLearning';
import { routeEvidence, SOURCES } from './evidenceRouter';
import type { EvidenceBundle } from './evidenceSources';
import type {
  AgentTask,
  VerificationEvidence,
  VerificationStatus,
} from './types';

export type TaskVerificationPayload = {
  taskId: string;
  // 'auto' = first-pass routing right after awaiting_review.
  // 'proof_evaluation' = re-route after teammate submits proof. Iteration count
  // increments so the rater can penalise multi-round verifications.
  mode?: 'auto' | 'proof_evaluation';
};

// ── Evidence gathering via the router ──────────────────────────────────────

async function gatherEvidence(task: AgentTask): Promise<{
  bundle: EvidenceBundle;
  routerReasoning: string;
}> {
  const decision = await routeEvidence(task);
  logger.info('verify: router decision', {
    taskId: task.id,
    source: decision.source,
    url: decision.url,
    reasoning: decision.reasoning,
  });

  if (decision.source === 'none') {
    return {
      bundle: { source: 'none', text: '', evidence: {}, thin: true },
      routerReasoning: decision.reasoning,
    };
  }

  const source = SOURCES[decision.source];
  const bundle = await source.fetch(task, { url: decision.url });
  if (!bundle) {
    return {
      bundle: { source: 'none', text: '', evidence: {}, thin: true },
      routerReasoning: `${decision.reasoning} (source returned no data)`,
    };
  }
  return { bundle, routerReasoning: decision.reasoning };
}

// ── LLM judging ─────────────────────────────────────────────────────────────

async function judgeWithLLM(task: AgentTask, bundle: EvidenceBundle): Promise<VerificationResult> {
  // Map our internal source names to the legacy `evidenceSource` enum the
  // verify prompt expects. Anything not in the legacy set is "proof_payload"
  // (a generic blob) for the prompt's purposes — the LLM still sees the full
  // evidence text.
  const promptSource =
    bundle.source === 'github_commits' ? 'commit_diff'
    : bundle.source === 'ga4_metric' ? 'metric_delta'
    : bundle.source === 'marketing_artifacts' ? 'marketing_artifact'
    : bundle.source === 'instagram_graph' ? 'marketing_artifact'
    : bundle.source === 'none' ? 'none'
    : 'proof_payload';

  const raw = await chatViaProviders(
    VERIFY_TASK_SYSTEM,
    verifyTaskUserPrompt({
      taskTitle: task.title,
      taskDescription: task.description,
      taskKind: task.kind,
      evidence: bundle.text,
      evidenceSource: promptSource,
    }),
    { temperature: 0.2, maxTokens: 2048, taskKind: 'task_verification' as never },
  );
  return parseAIResponse(raw, VerificationResultSchema);
}

async function rateWithLLM(input: {
  task: AgentTask;
  verdict: VerificationResult;
  iterations: number;
}): Promise<{ rating: 1 | -1; reasoning: string }> {
  const raw = await chatViaProviders(
    RATE_TASK_SYSTEM,
    rateTaskUserPrompt({
      taskTitle: input.task.title,
      taskDescription: input.task.description,
      verificationVerdict: input.verdict.verdict,
      verificationReasoning: input.verdict.reasoning,
      regressions: input.verdict.regressions ?? [],
      iterations: input.iterations,
    }),
    { temperature: 0.2, maxTokens: 512, taskKind: 'task_rating' as never },
  );
  const parsed = parseAIResponse(raw, QualityRatingSchema);
  return { rating: parsed.rating as 1 | -1, reasoning: parsed.reasoning };
}

// ── Public worker ──────────────────────────────────────────────────────────

export async function runTaskVerification(payload: TaskVerificationPayload): Promise<{
  taskId: string;
  status: VerificationStatus;
  ratingApplied: boolean;
}> {
  const task = await getTask(payload.taskId);
  if (!task) throw new Error(`task ${payload.taskId} not found`);
  if (!task.assignedTo) throw new Error(`task ${payload.taskId} has no assignee`);

  const mode: 'auto' | 'proof_evaluation' = payload.mode ?? 'auto';
  await setTaskVerification(task.id, {
    verificationStatus: mode === 'auto' ? 'auto_running' : 'proof_evaluating',
  });

  const { bundle, routerReasoning } = await gatherEvidence(task);

  // No source picked OR evidence is so thin we can't judge.
  // In auto mode → ask for proof. In proof_evaluation → mark inconclusive
  // (we already had a chance to look at the proof; nothing more to do).
  if (bundle.source === 'none' || (bundle.thin && mode === 'auto')) {
    await setTaskVerification(task.id, {
      verificationStatus: 'proof_requested',
      verificationEvidence: {
        ...bundle.evidence,
        verdict: `Router: ${routerReasoning}`,
        iterations: 0,
      },
    });
    return { taskId: task.id, status: 'proof_requested', ratingApplied: false };
  }

  const verdict = await judgeWithLLM(task, bundle);
  const priorIterations = (task.verificationEvidence?.iterations ?? 0);
  const iterations = mode === 'proof_evaluation' ? priorIterations + 1 : priorIterations;

  const evidence: VerificationEvidence = {
    ...bundle.evidence,
    verdict: verdict.reasoning,
    confidence: verdict.confidence,
    iterations,
  };

  // Inconclusive in auto mode → ask for proof. Inconclusive in proof_evaluation
  // → fail (we already saw the proof and still can't tell).
  if (verdict.verdict === 'inconclusive') {
    if (mode === 'auto') {
      await setTaskVerification(task.id, {
        verificationStatus: 'proof_requested',
        verificationEvidence: evidence,
      });
      return { taskId: task.id, status: 'proof_requested', ratingApplied: false };
    }
    await setTaskVerification(task.id, {
      verificationStatus: 'failed',
      verificationEvidence: evidence,
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'recgon',
      status: 'failed',
    });
    return { taskId: task.id, status: 'failed', ratingApplied: false };
  }

  if (verdict.verdict === 'failed') {
    await setTaskVerification(task.id, {
      verificationStatus: 'failed',
      verificationEvidence: evidence,
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'recgon',
      status: 'failed',
    });
    await logEvent({
      teamId: task.teamId,
      teammateId: task.assignedTo,
      taskId: task.id,
      event: 'completed',
      payload: { verdict: 'failed', reasoning: verdict.reasoning, source: bundle.source },
    });
    return { taskId: task.id, status: 'failed', ratingApplied: false };
  }

  // PASSED — flip task to completed, run quality rating, then update fit_profile.
  await setTaskVerification(task.id, {
    verificationStatus: 'passed',
    verificationEvidence: evidence,
    verifiedAt: new Date().toISOString(),
    verifiedBy: 'recgon',
    status: 'completed',
  });

  let ratingApplied = false;
  try {
    const quality = await rateWithLLM({ task, verdict, iterations });
    await upsertRating({
      taskId: task.id,
      teammateId: task.assignedTo,
      rating: quality.rating,
      note: quality.reasoning,
      ratedBy: 'recgon',
    });
    await logEvent({
      teamId: task.teamId,
      teammateId: task.assignedTo,
      taskId: task.id,
      event: 'rated',
      payload: { rating: quality.rating, note: quality.reasoning, by: 'recgon' },
    });
    await recordRatingForLearning(task.assignedTo, task.kind, quality.rating);
    await recordSkillRating(task.assignedTo, task.requiredSkills, quality.rating);
    ratingApplied = true;
  } catch (err) {
    logger.warn('verify: auto-rating failed (non-fatal)', {
      taskId: task.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  await logEvent({
    teamId: task.teamId,
    teammateId: task.assignedTo,
    taskId: task.id,
    event: 'completed',
    payload: { verdict: 'passed', reasoning: verdict.reasoning, source: bundle.source, ratingApplied },
  });

  return { taskId: task.id, status: 'passed', ratingApplied };
}

// ── Convenience: kick off verification on awaiting_review transition ──────

export async function enqueueVerification(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;
  if (task.verificationStatus === 'owner_override') return;
  if (!task.assignedTo) return;
  const teammate = await getTeammate(task.assignedTo);
  if (!teammate) return;

  const { enqueueJob } = await import('../llm/jobQueue');
  await enqueueJob({
    teamId: task.teamId,
    userId: teammate.userId ?? task.createdBy ?? '',
    kind: 'task_verification',
    payload: { taskId, mode: 'auto' } satisfies TaskVerificationPayload,
  });
  await setTaskVerification(taskId, { verificationStatus: 'auto_running' });
}

// Re-export the schema so callers (proof route) can sanity-check incoming JSON.
export const __ProofPayloadSchema = ProofPayloadSchema;
