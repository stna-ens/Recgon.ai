// Simple in-memory rate limiter for API routes.
// Uses a sliding-window counter keyed by (route, ip).

interface Window {
  count: number;
  resetAt: number;
}

// Attach to global so it persists across Next.js hot-reloads
const g = global as typeof globalThis & { _pmaiRateLimits?: Map<string, Window> };
if (!g._pmaiRateLimits) g._pmaiRateLimits = new Map();
const store = g._pmaiRateLimits;

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
export function isRateLimited(key: string, options: RateLimitOptions): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > options.limit;
}

// Default limits for the expensive Gemini-backed routes
export const ANALYZE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60_000 };
export const GENERATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
export const FEEDBACK_LIMIT: RateLimitOptions = { limit: 15, windowMs: 60_000 };
