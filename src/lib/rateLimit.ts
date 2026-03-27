// Persistent rate limiter for API routes.
// Uses a sliding-window counter keyed by (route, ip).
// Persists to a file so limits survive server restarts.

import fs from 'fs';
import path from 'path';

interface Window {
  count: number;
  resetAt: number;
}

const RATE_FILE = path.join(process.cwd(), 'data', 'rate_limits.json');

// In-memory cache; periodically synced to disk
const g = global as typeof globalThis & { _pmaiRateLimits?: Map<string, Window>; _pmaiRateDirty?: boolean };

function loadFromDisk(): Map<string, Window> {
  try {
    const raw = fs.readFileSync(RATE_FILE, 'utf-8');
    const entries: [string, Window][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToDisk(store: Map<string, Window>) {
  try {
    fs.mkdirSync(path.dirname(RATE_FILE), { recursive: true });
    // Prune expired entries before saving
    const now = Date.now();
    const entries = Array.from(store.entries()).filter(([, v]) => v.resetAt > now);
    fs.writeFileSync(RATE_FILE, JSON.stringify(entries));
  } catch {
    // Non-critical — rate limiting still works in-memory
  }
}

if (!g._pmaiRateLimits) {
  g._pmaiRateLimits = loadFromDisk();
  g._pmaiRateDirty = false;

  // Flush to disk every 30 seconds if dirty
  setInterval(() => {
    if (g._pmaiRateDirty && g._pmaiRateLimits) {
      saveToDisk(g._pmaiRateLimits);
      g._pmaiRateDirty = false;
    }
  }, 30_000).unref();
}

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
    g._pmaiRateDirty = true;
    return false;
  }

  entry.count += 1;
  g._pmaiRateDirty = true;
  return entry.count > options.limit;
}

// Default limits for the expensive Gemini-backed routes
export const ANALYZE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60_000 };
export const GENERATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 60_000 };
export const FEEDBACK_LIMIT: RateLimitOptions = { limit: 15, windowMs: 60_000 };
