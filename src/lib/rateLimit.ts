// Persistent rate limiter for API routes.
// Uses a sliding-window counter keyed by (route, ip).
// Persists to Supabase so limits survive server restarts and work across instances.

import { supabase } from './supabase';

export interface RateLimitOptions {
  /** Max requests allowed within windowMs */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
  /**
   * What to do if the backing store errors. 'closed' = treat as rate-limited
   * (safer for sensitive endpoints). 'open' = allow through. Defaults to 'closed'.
   */
  failMode?: 'open' | 'closed';
}

/**
 * Returns true if the request should be blocked (rate limit exceeded).
 * Fails closed by default — if the backing store errors, the request is blocked.
 * @param key  A unique string identifying the caller, e.g. `${route}:${ip}`
 */
export async function isRateLimited(key: string, options: RateLimitOptions): Promise<boolean> {
  const failClosed = (options.failMode ?? 'closed') === 'closed';
  const now = Date.now();
  const resetAt = now + options.windowMs;

  // Read existing row first — we cannot use a single `upsert` to "increment"
  // because Postgres upserts overwrite the columns we provide, which would
  // reset count back to 1 on every call.
  const { data: existing, error: readErr } = await supabase
    .from('rate_limits')
    .select('count, reset_at')
    .eq('key', key)
    .maybeSingle();

  if (readErr) return failClosed;

  // No row yet, or window expired → (re)start the window at count=1.
  if (!existing || now >= existing.reset_at) {
    const { error: upsertErr } = await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, reset_at: resetAt }, { onConflict: 'key' });
    if (upsertErr) return failClosed;
    return false;
  }

  // Window still active → increment.
  const newCount = existing.count + 1;
  const { error: incErr } = await supabase
    .from('rate_limits')
    .update({ count: newCount })
    .eq('key', key);
  if (incErr) return failClosed;

  return newCount > options.limit;
}

// Default limits for the expensive Gemini-backed routes
export const ANALYZE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60_000 };
export const GENERATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
export const FEEDBACK_LIMIT: RateLimitOptions = { limit: 15, windowMs: 60_000 };
export const REGISTER_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60 * 60_000 }; // 5/hour per IP
