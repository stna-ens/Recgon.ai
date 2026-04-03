// Persistent rate limiter for API routes.
// Uses a sliding-window counter keyed by (route, ip).
// Persists to Supabase so limits survive server restarts and work across instances.

import { supabase } from './supabase';

export interface RateLimitOptions {
  /** Max requests allowed within windowMs */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/**
 * Returns true if the request should be blocked (rate limit exceeded).
 * @param key  A unique string identifying the caller, e.g. `${route}:${ip}`
 */
export async function isRateLimited(key: string, options: RateLimitOptions): Promise<boolean> {
  const now = Date.now();
  const resetAt = now + options.windowMs;

  const { data, error } = await supabase
    .from('rate_limits')
    .upsert(
      { key, count: 1, reset_at: resetAt },
      {
        onConflict: 'key',
        ignoreDuplicates: false,
      }
    )
    .select('count, reset_at')
    .single();

  // If upsert inserted a new row, count is 1 — not rate limited
  if (error || !data) return false;

  // If the window has expired, reset
  if (now >= data.reset_at) {
    await supabase
      .from('rate_limits')
      .update({ count: 1, reset_at: resetAt })
      .eq('key', key);
    return false;
  }

  // Increment count
  const newCount = data.count + 1;
  await supabase
    .from('rate_limits')
    .update({ count: newCount })
    .eq('key', key);

  return newCount > options.limit;
}

// Default limits for the expensive Gemini-backed routes
export const ANALYZE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60_000 };
export const GENERATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
export const FEEDBACK_LIMIT: RateLimitOptions = { limit: 15, windowMs: 60_000 };
