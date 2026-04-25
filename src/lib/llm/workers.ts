// Workers that execute LLM jobs drained from the queue.
//
// Each worker receives the full job row and returns a JSON-serialisable
// result, which the caller stores on the row. A worker should not touch
// the queue itself — the drain loop is responsible for claim / complete /
// fail transitions.
//
// Failures thrown here surface to the drain loop, which calls `failJob()`
// to schedule the next retry (or mark `dead` once `max_attempts` is hit).
import { analyzeFeedback } from '../feedbackEngine';
import { analyzeIdea } from '../ideaAnalyzer';
import { analyzeCodebase, analyzeCodebaseUpdate } from '../codeAnalyzer';
import { analyzeCompetitors } from '../competitorAnalyzer';
import { cloneGitHubRepo, getLatestCommit } from '../githubFetcher';
import {
  saveFeedbackToProject,
  saveProject,
  getProject,
  generateId,
  type ProductAnalysis,
} from '../storage';
import { getUserById } from '../userStorage';
import { logger } from '../logger';
import { buildProjectAppContext } from '../appContext';
import type { JobKind, LLMJob } from './jobQueue';

export type WorkerResult = Record<string, unknown>;

// ── Feedback analysis ───────────────────────────────────────────────────────

type FeedbackPayload = {
  feedback: string[];
  projectId?: string;
  teamId?: string;
};

async function runFeedbackAnalysis(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as FeedbackPayload;
  if (!Array.isArray(payload.feedback) || payload.feedback.length === 0) {
    throw new Error('feedback_analysis job missing feedback array');
  }

  let project: Awaited<ReturnType<typeof getProject>> = undefined;
  if (payload.projectId && payload.teamId) {
    project = await getProject(payload.projectId, payload.teamId);
  }

  const result = await analyzeFeedback(
    payload.feedback,
    project ? buildProjectAppContext(project) : undefined,
  );

  // Persist to project if we were told which project this belongs to.
  if (payload.projectId && payload.teamId) {
    const analysis = {
      id: generateId(),
      rawFeedback: payload.feedback,
      sentiment: result.overallSentiment,
      summary: result.summary,
      sentimentBreakdown: result.sentimentBreakdown,
      themes: result.themes,
      featureRequests: result.featureRequests,
      bugs: result.bugs,
      praises: result.praises,
      developerPrompts: result.developerPrompts,
      analyzedAt: new Date().toISOString(),
    };
    try {
      await saveFeedbackToProject(payload.projectId, analysis, payload.teamId);
    } catch (err) {
      logger.warn('feedback worker failed to persist to project', {
        jobId: job.id,
        projectId: payload.projectId,
        err: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal — the LLM result is still returned.
    }
  }

  return result as unknown as WorkerResult;
}

// ── Idea analysis ───────────────────────────────────────────────────────────

type IdeaPayload = {
  projectId: string;
  teamId: string;
  description: string;
};

async function runIdeaAnalysis(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as IdeaPayload;
  if (!payload.projectId || !payload.description) {
    throw new Error('idea_analysis job missing projectId or description');
  }

  const project = await getProject(payload.projectId, payload.teamId);
  if (!project) throw new Error(`project ${payload.projectId} not found`);
  const appContext = buildProjectAppContext(project);
  const analysisWithContext = await analyzeIdea(payload.description, undefined, appContext);
  project.analysis = { ...analysisWithContext, analyzedAt: new Date().toISOString() };
  await saveProject(project);

  return { projectId: project.id } as WorkerResult;
}

// ── Codebase analysis ───────────────────────────────────────────────────────
// GitHub-backed projects only. Description-only projects use idea_analysis.
// Local-path projects (legacy) cannot be queued because the worker runs in a
// separate function with no access to the caller's fs; route will surface
// the error inline instead of enqueuing.

type CodebasePayload = {
  projectId: string;
  teamId: string;
  userId: string; // whose GitHub token to use (fetched at run time — never in payload)
  githubUrl: string;
  existingAnalysis?: ProductAnalysis; // present → diff-based update; absent → full
  diffStr?: string;
};

async function runCodebaseAnalysis(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as CodebasePayload;
  if (!payload.projectId || !payload.teamId || !payload.userId || !payload.githubUrl) {
    throw new Error('codebase_analysis job missing required fields');
  }

  const project = await getProject(payload.projectId, payload.teamId);
  if (!project) throw new Error(`project ${payload.projectId} not found`);
  const appContext = buildProjectAppContext(project);

  // Re-fetch GitHub token from the user row. Tokens are never stored in
  // the job payload (they'd sit at rest in plaintext in the queue).
  const user = await getUserById(payload.userId);
  const token = user?.githubAccessToken;

  let analysis;
  if (payload.existingAnalysis && payload.diffStr) {
    analysis = await analyzeCodebaseUpdate(payload.existingAnalysis, payload.diffStr, undefined, appContext);
  } else {
    const clonePath = await cloneGitHubRepo(payload.githubUrl, project.id, token);
    project.path = clonePath;
    analysis = await analyzeCodebase(clonePath, undefined, appContext);
    // Record the SHA we just analyzed so the next re-analysis is diff-based.
    const commit = await getLatestCommit(payload.githubUrl, token).catch(() => null);
    if (commit) project.lastAnalyzedCommitSha = commit.sha;
  }

  project.analysis = { ...analysis, analyzedAt: new Date().toISOString() };
  await saveProject(project);

  return { projectId: project.id } as WorkerResult;
}

// ── Competitor analysis ─────────────────────────────────────────────────────

type CompetitorPayload = {
  projectId: string;
  teamId: string;
};

async function runCompetitorAnalysis(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as CompetitorPayload;
  if (!payload.projectId || !payload.teamId) {
    throw new Error('competitor_analysis job missing projectId/teamId');
  }

  const project = await getProject(payload.projectId, payload.teamId);
  if (!project?.analysis?.competitors?.some((c) => c.url)) {
    // Nothing to analyze — treat as a no-op success so the job doesn't retry.
    return { skipped: true };
  }

  const insights = await analyzeCompetitors(project.analysis.competitors, project.analysis);
  project.analysis = { ...project.analysis, competitorInsights: insights };
  await saveProject(project);

  return { projectId: project.id, insightCount: insights.length } as WorkerResult;
}

// ── Dispatch table ──────────────────────────────────────────────────────────

type Worker = (job: LLMJob) => Promise<WorkerResult>;

const WORKERS: Partial<Record<JobKind, Worker>> = {
  feedback_analysis: runFeedbackAnalysis,
  idea_analysis: runIdeaAnalysis,
  codebase_analysis: runCodebaseAnalysis,
  competitor_analysis: runCompetitorAnalysis,
};

export async function runJob(job: LLMJob): Promise<WorkerResult> {
  const worker = WORKERS[job.kind];
  if (!worker) {
    throw new Error(`No worker registered for kind=${job.kind}`);
  }
  return worker(job);
}

export function workerRegistered(kind: JobKind): boolean {
  return Boolean(WORKERS[kind]);
}
