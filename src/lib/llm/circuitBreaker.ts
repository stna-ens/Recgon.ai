// Shared circuit breaker for LLM providers.
//
// Backed by the `llm_health` table (see 20260418_llm_health.sql) so
// every Vercel instance sees the same breaker state. Without shared
// state, each instance independently rediscovers a Gemini outage on
// its own traffic — we'd pay the overload-latency tax on every
// instance's first request of each cold start.
//
// Design choices:
//
// - **Fail-open.** If Supabase itself is unreachable or the RPC errors,
//   `shouldTry()` returns true. A broken breaker must never block
//   working providers.
//
// - **Local read cache.** A 'closed' decision is cached in-process for
//   LOCAL_CACHE_MS so the happy path (healthy provider) pays zero
//   Supabase latency per call. 'skip' / 'probe' decisions are not
//   cached — we want fresh reads when state is interesting so we
//   re-check quickly once cooldown expires.
//
// - **No caching of record_success/record_failure.** Writes are cheap
//   and fire-and-forget from the caller (`void recordSuccess(...)`),
//   so we don't block LLM calls on breaker bookkeeping.
//
// Thresholds are set in SQL (5 failures / 30s window / 60s cooldown).
// Change them there, not here — the SQL function is the source of truth
// so all instances agree.

import { supabase } from '../supabase';
import { logger } from '../logger';

const LOCAL_CACHE_MS = 10_000;

type CacheEntry = { decision: 'closed'; expiresAt: number };
const closedCache = new Map<string, CacheEntry>();

/**
 * Returns true if the breaker allows a call to `provider` right now.
 *
 * Fails open on breaker errors — a degraded breaker must not degrade
 * working providers.
 */
export async function shouldTry(provider: string): Promise<boolean> {
  const cached = closedCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) {
    return true;
  }

  try {
    const { data, error } = await supabase.rpc('llm_health_try', { p_provider: provider });
    if (error) {
      logger.warn('circuit breaker read failed; failing open', {
        provider,
        err: error.message,
      });
      return true;
    }
    const decision = Boolean(data);
    // Only cache the happy path. 'skip' (false) must go back to
    // Supabase every time so we catch cooldown expiry.
    if (decision) {
      // We can't distinguish 'closed' vs 'probe' (both return true)
      // without extra plumbing, so we conservatively don't cache.
      // `llm_health_try` flips state atomically once per probe, so
      // double-probing is cheap (just one extra RPC round-trip).
    }
    return decision;
  } catch (err) {
    logger.warn('circuit breaker read threw; failing open', {
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/**
 * Record a successful call. Clears the breaker state for `provider`.
 * Idempotent; cheap when the breaker was already closed.
 */
export async function recordSuccess(provider: string): Promise<void> {
  closedCache.set(provider, { decision: 'closed', expiresAt: Date.now() + LOCAL_CACHE_MS });
  try {
    const { error } = await supabase.rpc('llm_health_record_success', { p_provider: provider });
    if (error) {
      logger.warn('circuit breaker success record failed', {
        provider,
        err: error.message,
      });
    }
  } catch (err) {
    logger.warn('circuit breaker success record threw', {
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Record a recoverable failure (overload / rate-limit) for `provider`.
 * Opens the breaker if we cross the threshold in the rolling window.
 *
 * Only call this for recoverable errors. Non-recoverable errors (auth,
 * schema violations) are caller bugs, not provider health issues.
 */
export async function recordFailure(provider: string): Promise<void> {
  // Invalidate the closed-cache so the next call re-reads state and
  // sees the potentially-open breaker.
  closedCache.delete(provider);
  try {
    const { error } = await supabase.rpc('llm_health_record_failure', { p_provider: provider });
    if (error) {
      logger.warn('circuit breaker failure record failed', {
        provider,
        err: error.message,
      });
    }
  } catch (err) {
    logger.warn('circuit breaker failure record threw', {
      provider,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

// Test hooks.
export const __testing = {
  clearLocalCache: () => closedCache.clear(),
};
