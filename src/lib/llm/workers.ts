// Workers that execute LLM jobs drained from the queue.
//
// Each worker receives the full job row and returns a JSON-serialisable
// result, which the caller stores on the row. A worker should not touch
// the queue itself — the drain loop is responsible for claim / complete /
// fail transitions.
//
// Failures thrown here surface to the drain loop, which calls `failJob()`
// to schedule the next retry (or mark `dead` once `max_attempts` is hit).
import { analyzeIdea } from '../ideaAnalyzer';
import { analyzeCodebase, analyzeCodebaseUpdate } from '../codeAnalyzer';
import { analyzeCompetitors } from '../competitorAnalyzer';
import { cloneGitHubRepo, getLatestCommit } from '../githubFetcher';
import { runDispatch } from '../recgon/dispatcher';
import { runTaskVerification, type TaskVerificationPayload } from '../recgon/verify';
import { runCommitSummaryJob } from '../commitSummary';
import {
  saveProject,
  getProject,
  generateId,
  autoDetectLogo,
  type ProductAnalysis,
} from '../storage';
import { getUserById } from '../userStorage';
import { getProfile } from '../recgon/profileStorage';
import { runScan } from '../recgon/githubSkills';
import { supabase } from '../supabase';
import { logger } from '../logger';
import { buildProjectAppContext } from '../appContext';
import type { JobKind, LLMJob } from './jobQueue';

export type WorkerResult = Record<string, unknown>;

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
  await autoDetectLogo(project).catch(() => {});

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
  await autoDetectLogo(project).catch(() => {});

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

// ── GitHub skill inference (Phase 2 / SKILL-02) ─────────────────────────────
// Mines commits in team-connected repos and emits canonical-skill rows to
// `teammate_inferred_skills`. Token is re-fetched at run time (never in
// payload — same pattern as runCodebaseAnalysis). Worker returns
// `{skipped:true, reason}` on all early-exit paths (no consent / no token /
// no team repos) so the job doesn't enter the ~7.5h retry-backoff horizon
// (jobQueue.ts:86-96 / PATTERNS.md §Job worker no-op success on early exit).

export type GithubSkillInferencePayload = {
  teammateId: string;
  teamId: string;
  userId: string; // whose GitHub token to use (fetched at run time — never in payload)
};

export async function runGithubSkillInference(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as GithubSkillInferencePayload;
  if (!payload?.teammateId || !payload?.teamId || !payload?.userId) {
    throw new Error('github_skill_inference job missing required fields');
  }

  // Gate 1 (D-22): consent. Check teammate_profiles.github_mining_consent_at.
  // Consent revoked between enqueue and run → exit clean.
  const profile = await getProfile(payload.teamId, payload.userId).catch(() => null);
  const consentAt = profile?.githubMiningConsentAt ?? null;
  if (!consentAt) {
    return { skipped: true, reason: 'no_consent' };
  }

  // Gate 2 (T-02-07): re-fetch GitHub token from the user row. Tokens are
  // never stored in the job payload — they'd sit at rest in plaintext in
  // the queue. Matches the codebase_analysis pattern at workers.ts:81-84.
  const user = await getUserById(payload.userId).catch(() => null);
  const token = user?.githubAccessToken;
  if (!token) {
    return { skipped: true, reason: 'no_token' };
  }

  // Read inference depth from teams.inference_depth (D-23). Default 'standard'
  // if the column is somehow null. Best-effort: any error → standard.
  let depth: 'cheap' | 'standard' | 'deep' = 'standard';
  try {
    const teamRow = await supabase
      .from('teams')
      .select('inference_depth')
      .eq('id', payload.teamId)
      .maybeSingle();
    const raw = (teamRow.data as { inference_depth?: string | null } | null)?.inference_depth;
    if (raw === 'cheap' || raw === 'standard' || raw === 'deep') depth = raw;
  } catch (err) {
    logger.warn('runGithubSkillInference: could not read inference_depth, defaulting to standard', {
      teamId: payload.teamId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const author = user?.githubUsername ?? user?.nickname ?? user?.email ?? '';

  const result = await runScan({
    teammateId: payload.teammateId,
    teamId: payload.teamId,
    author,
    token,
    consentAt,
    depth,
  });

  return result as unknown as WorkerResult;
}

// ── Dispatch table ──────────────────────────────────────────────────────────

type Worker = (job: LLMJob) => Promise<WorkerResult>;

// Wrap analysis workers so successful completion fires Recgon dispatch — new
// next-steps and dev-prompts become tasks immediately, not on the next cron.
function withRecgonDispatch(inner: Worker): Worker {
  return async (job) => {
    const result = await inner(job);
    if (job.team_id) {
      runDispatch(job.team_id).catch((err) => {
        logger.warn('post-analysis recgon dispatch failed', {
          jobId: job.id,
          teamId: job.team_id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }
    return result;
  };
}

async function runTaskVerificationJob(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as TaskVerificationPayload;
  if (!payload?.taskId) throw new Error('task_verification job missing taskId');
  const result = await runTaskVerification(payload);
  return result as unknown as WorkerResult;
}

// ── Commit summary ──────────────────────────────────────────────────────────
// Plain-English, single-sentence read of one git commit. Persists to
// `commit_summaries` (idempotent on (github_url, sha)). Read by the home
// cockpit's "updates" column to replace raw commit messages like "bug fixes"
// with Recgon's understanding of what actually changed.
type CommitSummaryPayload = {
  githubUrl: string;
  sha: string;
  token?: string;
};
async function runCommitSummary(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as CommitSummaryPayload;
  const row = await runCommitSummaryJob(payload);
  return row as unknown as WorkerResult;
}

// ── Task reframe (Phase 4 / Plan 01) ────────────────────────────────────────
//
// Per-assignment worker. Reads the canonical task row, loads the assignee's
// declared profile, calls `runReframe()` (pure, adapter-injected), and
// persists the resulting sentence to `agent_tasks.personalized_description`.
//
// Skip paths (return `{ skipped: true, reason: ... }` without throwing — the
// queue treats these as success and does NOT retry):
//   - `'reassigned'`       → assignee changed between enqueue and run.
//   - `'columns_missing'`  → migration not applied (FRAME-02 fail-soft).
//   - `'no_assignee'`      → task has no assigned_to (legacy or unassigned).
//   - `'no_teammate'`      → assigned_to teammate row was retired/deleted.
//   - `'no_user'`          → teammate.user_id is null (non-user teammate).
//   - `'no_profile'`       → assignee has no teammate_profiles row yet.
//
// Throw paths (jobQueue's exponential backoff retries; max_attempts caps):
//   - `ReframeError` of any kind → surfaced as a thrown Error for retry.

export type TaskReframePayload = {
  taskId: string;
  assigneeUserId: string;
  teamId: string;
};

export async function runTaskReframe(job: LLMJob): Promise<WorkerResult> {
  const payload = job.payload as Partial<TaskReframePayload>;
  if (!payload?.taskId || !payload?.assigneeUserId || !payload?.teamId) {
    throw new Error('task_reframe job missing required fields (taskId, assigneeUserId, teamId)');
  }

  // 1. Load the canonical task row.
  const taskRow = await supabase
    .from('agent_tasks')
    .select(
      'id, team_id, project_id, title, description, kind, assigned_to, assignment_reasoning',
    )
    .eq('id', payload.taskId)
    .maybeSingle();
  if (taskRow.error) {
    throw new Error(`task_reframe: failed to load task ${payload.taskId}: ${taskRow.error.message}`);
  }
  if (!taskRow.data) {
    return { skipped: true, reason: 'task_not_found' };
  }
  const task = taskRow.data as {
    id: string;
    team_id: string;
    project_id: string | null;
    title: string;
    description: string | null;
    kind: string;
    assigned_to: string | null;
    assignment_reasoning: unknown;
  };

  if (!task.assigned_to) {
    return { skipped: true, reason: 'no_assignee' };
  }

  // 2. Resolve the teammate → user_id and run the reassignment race shield.
  const teammateRow = await supabase
    .from('teammates')
    .select('id, user_id, status')
    .eq('id', task.assigned_to)
    .maybeSingle();
  if (teammateRow.error) {
    throw new Error(
      `task_reframe: failed to load teammate ${task.assigned_to}: ${teammateRow.error.message}`,
    );
  }
  if (!teammateRow.data) {
    return { skipped: true, reason: 'no_teammate' };
  }
  const teammate = teammateRow.data as {
    id: string;
    user_id: string | null;
    status: string | null;
  };
  if (!teammate.user_id) {
    return { skipped: true, reason: 'no_user' };
  }
  if (teammate.user_id !== payload.assigneeUserId) {
    // Reassignment race — task moved to a different teammate after the job
    // was enqueued. Plan 04-03 will hook reassignment to invalidate +
    // re-enqueue; for now we silently skip.
    return { skipped: true, reason: 'reassigned' };
  }

  // 3. Load the assignee's declared profile.
  const profile = await getProfile(payload.teamId, payload.assigneeUserId).catch(() => null);
  if (!profile) {
    return { skipped: true, reason: 'no_profile' };
  }

  // 4. Best-effort recent project state. NEVER block reframe on failure here.
  let recentProjectState: import('../recgon/reframe').ReframeInputs['recentProjectState'] = null;
  try {
    if (task.project_id) {
      const recentTaskRows = await supabase
        .from('agent_tasks')
        .select('title')
        .eq('project_id', task.project_id)
        .order('created_at', { ascending: false })
        .limit(5);
      const titles = ((recentTaskRows.data ?? []) as { title: string }[])
        .map((r) => r.title)
        .filter((t) => typeof t === 'string' && t.length > 0);
      if (titles.length > 0) {
        recentProjectState = { recentTaskTitles: titles };
      }
    }
  } catch (err) {
    logger.warn('task_reframe: recentProjectState load failed (continuing)', {
      taskId: payload.taskId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Build inputs + run the pure module. ReframeError → re-throw for retry.
  const { runReframe } = await import('../recgon/reframe');
  const result = await runReframe({
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      kind: task.kind,
    },
    assignee: {
      userId: payload.assigneeUserId,
      declaredSkills: profile.skillsCanonical ?? [],
      declaredInterests: profile.interestsCanonical ?? [],
    },
    assignmentReasoning:
      (task.assignment_reasoning as import('../recgon/types').AssignmentReasoning | null) ??
      null,
    recentProjectState,
  });

  // 6. Persist — fail-soft if the migration hasn't run in this env.
  const updateRes = await supabase
    .from('agent_tasks')
    .update({
      personalized_description: result.sentence,
      personalized_description_for_user_id: payload.assigneeUserId,
    })
    .eq('id', payload.taskId);

  if (updateRes.error) {
    const msg = updateRes.error.message.toLowerCase();
    // WR-02: prefer the canonical Postgres error code (42703 = undefined_column)
    // over substring matching on the message text. Supabase forwards the
    // Postgres `code` field on PostgrestError; substring is kept as a
    // belt-and-suspenders fallback in case future drivers strip the code.
    const isUndefinedColumn =
      updateRes.error.code === '42703' ||
      (msg.includes('column') && msg.includes('does not exist'));
    if (isUndefinedColumn) {
      logger.warn('reframe_columns_missing', {
        taskId: payload.taskId,
        err: updateRes.error.message,
      });
      return { skipped: true, reason: 'columns_missing' };
    }
    throw new Error(
      `task_reframe: failed to persist personalized_description for ${payload.taskId}: ${updateRes.error.message}`,
    );
  }

  return {
    success: true,
    taskId: payload.taskId,
    sentence: result.sentence,
    citedMoves: result.citedMoves,
  };
}

const WORKERS: Partial<Record<JobKind, Worker>> = {
  idea_analysis: withRecgonDispatch(runIdeaAnalysis),
  codebase_analysis: withRecgonDispatch(runCodebaseAnalysis),
  competitor_analysis: runCompetitorAnalysis,
  task_verification: runTaskVerificationJob,
  commit_summary: runCommitSummary,
  github_skill_inference: runGithubSkillInference,
  task_reframe: runTaskReframe,
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
