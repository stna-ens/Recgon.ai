import { randomUUID } from 'crypto';
import { supabase } from '../supabase';
import { logger } from '../logger';

export type JobKind =
  | 'feedback_analysis'
  | 'codebase_analysis'
  | 'competitor_analysis'
  | 'idea_analysis';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'dead';

export type LLMJob = {
  id: string;
  team_id: string;
  user_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  status: JobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EnqueueParams = {
  teamId: string;
  userId: string;
  kind: JobKind;
  payload: Record<string, unknown>;
};

export async function enqueueJob(params: EnqueueParams): Promise<LLMJob> {
  const { data, error } = await supabase
    .from('llm_jobs')
    .insert({
      team_id: params.teamId,
      user_id: params.userId,
      kind: params.kind,
      payload: params.payload,
      status: 'pending',
      next_retry_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to enqueue ${params.kind} job: ${error?.message ?? 'no data'}`);
  }
  logger.info('llm_jobs enqueued', { id: data.id, kind: params.kind });
  return data as LLMJob;
}

/** Atomically claim the next runnable pending job. Returns null if none. */
export async function claimNextJob(workerId?: string): Promise<LLMJob | null> {
  const id = workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase.rpc('claim_next_llm_job', { worker_id: id });
  if (error) {
    throw new Error(`claim_next_llm_job failed: ${error.message}`);
  }
  const rows = (data ?? []) as LLMJob[];
  return rows.length > 0 ? rows[0] : null;
}

export async function completeJob(id: string, result: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('llm_jobs')
    .update({
      status: 'succeeded',
      result,
      error: null,
      locked_at: null,
      locked_by: null,
    })
    .eq('id', id);
  if (error) throw new Error(`completeJob(${id}) failed: ${error.message}`);
  logger.info('llm_jobs succeeded', { id });
}

/**
 * Backoff schedule (in seconds): 60, 120, 300, 600, 1200, 1800, 3600, 3600, 3600, 3600, 3600, 3600.
 * Sum ≈ 26,880s ≈ 7.5h. With max_attempts=12 (default) the job is retried
 * through a ~multi-hour outage window before being marked `dead`.
 */
const BACKOFF_SECONDS = [60, 120, 300, 600, 1200, 1800, 3600, 3600, 3600, 3600, 3600, 3600];

function nextRetryAt(attempts: number): string {
  const idx = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
  const seconds = BACKOFF_SECONDS[Math.max(0, idx)];
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Mark a running job as failed. If it has retries left, schedule another
 * attempt; otherwise mark it `dead`.
 */
export async function failJob(
  job: Pick<LLMJob, 'id' | 'attempts' | 'max_attempts'>,
  errorMessage: string,
): Promise<void> {
  const hasRetries = job.attempts < job.max_attempts;
  const next = hasRetries ? nextRetryAt(job.attempts) : null;
  const status: JobStatus = hasRetries ? 'pending' : 'dead';

  const { error } = await supabase
    .from('llm_jobs')
    .update({
      status,
      error: errorMessage.slice(0, 2000),
      next_retry_at: next ?? new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq('id', job.id);
  if (error) throw new Error(`failJob(${job.id}) failed: ${error.message}`);
  logger.warn('llm_jobs failed', {
    id: job.id,
    attempts: job.attempts,
    status,
    nextRetryAt: next,
  });
}

export async function getJob(id: string): Promise<LLMJob | null> {
  const { data, error } = await supabase
    .from('llm_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getJob(${id}) failed: ${error.message}`);
  return (data as LLMJob | null) ?? null;
}

/**
 * Release a stuck job — one where `locked_at` is old but status is still
 * 'running'. Called by the cron drain as a safety valve if a worker crashed
 * mid-execution. `thresholdMs` defaults to 15 minutes.
 */
export async function releaseStuckJobs(thresholdMs = 15 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();
  const { data, error } = await supabase
    .from('llm_jobs')
    .update({
      status: 'pending',
      locked_at: null,
      locked_by: null,
      next_retry_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('locked_at', cutoff)
    .select('id');
  if (error) throw new Error(`releaseStuckJobs failed: ${error.message}`);
  const count = data?.length ?? 0;
  if (count > 0) logger.warn('llm_jobs released stuck', { count });
  return count;
}

// Exposed for tests.
export const __testing = { nextRetryAt, BACKOFF_SECONDS };
