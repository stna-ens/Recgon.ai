// Phase 2 / SKILL-06 — Time decay (read-time, τ=90 days).
//
// RED state (Plan 02-01): `applyTimeDecay` does not exist in
// src/lib/recgon/fitLearning.ts yet. Plan 02-04 adds it.
//
// Spec (PLAN.md task 1 behavior + RESEARCH Pattern 5):
//   - Δt=0 → score unchanged
//   - Δt=90d → score × exp(-1) ≈ 0.3679 (within 1e-4)
//   - Δt=180d → score × exp(-2) ≈ 0.1353
//   - lastSeenAt as ISO string is accepted
//   - `now` parameter injectable (no internal Date.now() calls)

import { describe, it, expect } from 'vitest';

// Module-under-test — Plan 02-04 will add this export.
import { applyTimeDecay } from '@/lib/recgon/fitLearning';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('applyTimeDecay (SKILL-06)', () => {
  it('(a) Δt = 0 → score unchanged', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const result = applyTimeDecay(0.8, now, now);
    expect(result).toBeCloseTo(0.8, 6);
  });

  it('(b) Δt = 90d → score × exp(-1) ≈ 0.3679', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 90 * DAY_MS);
    const result = applyTimeDecay(1.0, lastSeen, now);
    expect(result).toBeCloseTo(Math.exp(-1), 4);
  });

  it('(c) Δt = 180d → score × exp(-2) ≈ 0.1353', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 180 * DAY_MS);
    const result = applyTimeDecay(1.0, lastSeen, now);
    expect(result).toBeCloseTo(Math.exp(-2), 4);
  });

  it('(d) accepts lastSeenAt as ISO string', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const isoLastSeen = new Date(now.getTime() - 90 * DAY_MS).toISOString();
    const result = applyTimeDecay(1.0, isoLastSeen, now);
    expect(result).toBeCloseTo(Math.exp(-1), 4);
  });

  it('(e) `now` parameter is injectable (no internal Date.now() call)', () => {
    // If applyTimeDecay reads Date.now() internally, two calls with the same
    // injected `now` would still drift. We use a fixed `now` and assert the
    // result is deterministic across two calls.
    const now = new Date('2026-05-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - 45 * DAY_MS);
    const a = applyTimeDecay(1.0, lastSeen, now);
    const b = applyTimeDecay(1.0, lastSeen, now);
    expect(a).toBe(b);
    expect(a).toBeCloseTo(Math.exp(-0.5), 4);
  });
});
