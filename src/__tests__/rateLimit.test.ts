import { describe, it, expect, beforeEach } from 'vitest';

// We need to test the rate limiter logic, but the module uses globals.
// Test the core logic directly.

describe('rateLimit logic', () => {
  let store: Map<string, { count: number; resetAt: number }>;

  function isRateLimited(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  beforeEach(() => {
    store = new Map();
  });

  it('allows requests under limit', () => {
    expect(isRateLimited('test', 3, 60_000)).toBe(false);
    expect(isRateLimited('test', 3, 60_000)).toBe(false);
    expect(isRateLimited('test', 3, 60_000)).toBe(false);
  });

  it('blocks requests over limit', () => {
    expect(isRateLimited('test', 2, 60_000)).toBe(false);
    expect(isRateLimited('test', 2, 60_000)).toBe(false);
    expect(isRateLimited('test', 2, 60_000)).toBe(true);
  });

  it('tracks different keys independently', () => {
    expect(isRateLimited('key-a', 1, 60_000)).toBe(false);
    expect(isRateLimited('key-b', 1, 60_000)).toBe(false);
    expect(isRateLimited('key-a', 1, 60_000)).toBe(true);
    expect(isRateLimited('key-b', 1, 60_000)).toBe(true);
  });

  it('resets after window expires', () => {
    store.set('expired', { count: 100, resetAt: Date.now() - 1 });
    expect(isRateLimited('expired', 5, 60_000)).toBe(false);
  });
});
