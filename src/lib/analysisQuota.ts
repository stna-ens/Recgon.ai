/**
 * Analysis quota enforcement for METU users.
 *
 * Rules:
 *  - Each user may run at most 3 project analyses in total (lifetime).
 *  - There must be at least 14 days between consecutive analyses.
 *
 * The quota is tracked in the `analysis_quotas` table. A row is lazily
 * created on the first check, so no back-fill migration is needed.
 */

import { supabase } from './supabase';

/** How many total analyses a user is allowed (lifetime cap). */
const MAX_ANALYSES = 3;
/** Minimum gap between two analyses, in milliseconds (14 days). */
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Emails listed in QUOTA_EXEMPT_EMAILS (comma-separated) skip all quota
 * checks. Use this for your team / testers.
 */
function isExempt(email: string): boolean {
  const raw = process.env.QUOTA_EXEMPT_EMAILS ?? '';
  if (!raw) return false;
  const exemptList = raw.split(',').map((e) => e.trim().toLowerCase());
  return exemptList.includes(email.toLowerCase());
}

export interface QuotaStatus {
  /** Whether the user is allowed to run an analysis right now. */
  allowed: boolean;
  /** How many analyses the user has consumed so far. */
  used: number;
  /** Lifetime cap. */
  limit: number;
  /** If blocked, human-readable reason. */
  reason?: string;
  /** If in cooldown, the date when the user can next analyze. */
  nextAvailableAt?: string;
}

/**
 * Check whether a user is allowed to run a new project analysis.
 * Does NOT consume a use — call `recordAnalysis` after a successful analysis.
 */
export async function checkAnalysisQuota(userId: string, email?: string): Promise<QuotaStatus> {
  // Exempt users have unlimited access
  if (email && isExempt(email)) {
    return { allowed: true, used: 0, limit: MAX_ANALYSES };
  }

  const { data, error } = await supabase
    .from('analysis_quotas')
    .select('total_count, last_analyzed_at')
    .eq('user_id', userId)
    .maybeSingle();

  // If the table doesn't exist or there's a transient error, fail open so
  // existing users aren't locked out. The quota is a soft limit.
  if (error) {
    console.error('[analysisQuota] read error, allowing through:', error.message);
    return { allowed: true, used: 0, limit: MAX_ANALYSES };
  }

  const totalCount = data?.total_count ?? 0;
  const lastAnalyzedAt = data?.last_analyzed_at ? new Date(data.last_analyzed_at).getTime() : null;

  // 1. Lifetime cap
  if (totalCount >= MAX_ANALYSES) {
    return {
      allowed: false,
      used: totalCount,
      limit: MAX_ANALYSES,
      reason: `You have used all ${MAX_ANALYSES} of your available project analyses.`,
    };
  }

  // 2. Cooldown check (only if user has analyzed at least once)
  if (lastAnalyzedAt !== null) {
    const elapsed = Date.now() - lastAnalyzedAt;
    if (elapsed < COOLDOWN_MS) {
      const nextAvailable = new Date(lastAnalyzedAt + COOLDOWN_MS);
      return {
        allowed: false,
        used: totalCount,
        limit: MAX_ANALYSES,
        reason: `You can run your next analysis after ${nextAvailable.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
        nextAvailableAt: nextAvailable.toISOString(),
      };
    }
  }

  return { allowed: true, used: totalCount, limit: MAX_ANALYSES };
}

/**
 * Record that a user has just completed an analysis.
 * Should be called after the analysis is successfully saved.
 */
export async function recordAnalysis(userId: string, email?: string): Promise<void> {
  // Don't track quota for exempt users
  if (email && isExempt(email)) return;

  const now = new Date().toISOString();

  // Read first to decide insert vs update (upsert would reset count to 1)
  const { data, error: readError } = await supabase
    .from('analysis_quotas')
    .select('total_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[analysisQuota] recordAnalysis read failed:', readError.message);
    return;
  }

  if (data) {
    const { error } = await supabase
      .from('analysis_quotas')
      .update({ total_count: data.total_count + 1, last_analyzed_at: now })
      .eq('user_id', userId);
    if (error) console.error('[analysisQuota] recordAnalysis update failed:', error.message);
  } else {
    const { error } = await supabase
      .from('analysis_quotas')
      .insert({ user_id: userId, total_count: 1, last_analyzed_at: now });
    if (error) console.error('[analysisQuota] recordAnalysis insert failed:', error.message);
  }
}

/**
 * Get the current quota status for a user (read-only, for display in the UI).
 */
export async function getAnalysisQuota(userId: string, email?: string): Promise<QuotaStatus> {
  return checkAnalysisQuota(userId, email);
}
