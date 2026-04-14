import { describe, it, expect } from 'vitest';

/**
 * Tests for the analysis quota logic extracted from analysisQuota.ts.
 *
 * Rules:
 *  - Max 3 analyses lifetime
 *  - At least 14 days between consecutive analyses
 */

const MAX_ANALYSES = 3;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

interface QuotaRow {
  total_count: number;
  last_analyzed_at: string | null;
}

function checkQuota(row: QuotaRow | null): {
  allowed: boolean;
  used: number;
  reason?: string;
  nextAvailableAt?: string;
} {
  const totalCount = row?.total_count ?? 0;
  const lastAnalyzedAt = row?.last_analyzed_at ? new Date(row.last_analyzed_at).getTime() : null;

  if (totalCount >= MAX_ANALYSES) {
    return {
      allowed: false,
      used: totalCount,
      reason: `You have used all ${MAX_ANALYSES} of your available project analyses.`,
    };
  }

  if (lastAnalyzedAt !== null) {
    const elapsed = Date.now() - lastAnalyzedAt;
    if (elapsed < COOLDOWN_MS) {
      const nextAvailable = new Date(lastAnalyzedAt + COOLDOWN_MS);
      return {
        allowed: false,
        used: totalCount,
        reason: `You can run your next analysis after ${nextAvailable.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
        nextAvailableAt: nextAvailable.toISOString(),
      };
    }
  }

  return { allowed: true, used: totalCount };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('analysisQuota logic', () => {
  describe('first-time user (no row)', () => {
    it('allows analysis', () => {
      const result = checkQuota(null);
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
    });
  });

  describe('lifetime cap (3 analyses)', () => {
    it('blocks when total_count reaches 3', () => {
      const result = checkQuota({ total_count: 3, last_analyzed_at: daysAgo(20) });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('used all 3');
    });

    it('blocks even if last analysis was long ago', () => {
      const result = checkQuota({ total_count: 3, last_analyzed_at: daysAgo(100) });
      expect(result.allowed).toBe(false);
    });

    it('allows when under cap (1 used, 14+ days ago)', () => {
      const result = checkQuota({ total_count: 1, last_analyzed_at: daysAgo(15) });
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(1);
    });

    it('allows when under cap (2 used, 14+ days ago)', () => {
      const result = checkQuota({ total_count: 2, last_analyzed_at: daysAgo(14) });
      // 14 days exactly — elapsed >= COOLDOWN_MS so it should pass
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(2);
    });
  });

  describe('cooldown enforcement (14-day gap)', () => {
    it('blocks when last analysis was 7 days ago', () => {
      const result = checkQuota({ total_count: 1, last_analyzed_at: daysAgo(7) });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('next analysis after');
      expect(result.nextAvailableAt).toBeDefined();
    });

    it('blocks when last analysis was 1 day ago', () => {
      const result = checkQuota({ total_count: 2, last_analyzed_at: daysAgo(1) });
      expect(result.allowed).toBe(false);
    });

    it('allows when last analysis was exactly 14 days ago', () => {
      // 14 * 24 * 60 * 60 * 1000 elapsed — border case should pass
      const last = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const result = checkQuota({ total_count: 1, last_analyzed_at: last });
      expect(result.allowed).toBe(true);
    });

    it('allows when last analysis was 15 days ago', () => {
      const result = checkQuota({ total_count: 1, last_analyzed_at: daysAgo(15) });
      expect(result.allowed).toBe(true);
    });
  });

  describe('3 analyses separated by 2 weeks each (the full Metustars scenario)', () => {
    it('analysis #1: fresh user, allowed', () => {
      const result = checkQuota(null);
      expect(result.allowed).toBe(true);
    });

    it('analysis #2: 1 used, 14+ days later, allowed', () => {
      const result = checkQuota({ total_count: 1, last_analyzed_at: daysAgo(15) });
      expect(result.allowed).toBe(true);
    });

    it('analysis #3: 2 used, 14+ days after #2, allowed', () => {
      const result = checkQuota({ total_count: 2, last_analyzed_at: daysAgo(15) });
      expect(result.allowed).toBe(true);
    });

    it('analysis #4 attempt: 3 used, lifetime cap hit', () => {
      const result = checkQuota({ total_count: 3, last_analyzed_at: daysAgo(15) });
      expect(result.allowed).toBe(false);
      expect(result.used).toBe(3);
      expect(result.reason).toContain('used all 3');
    });

    it('analysis #2 attempted too early (1 week after #1): blocked by cooldown', () => {
      const result = checkQuota({ total_count: 1, last_analyzed_at: daysAgo(7) });
      expect(result.allowed).toBe(false);
      expect(result.nextAvailableAt).toBeDefined();
    });
  });

  describe('nextAvailableAt accuracy', () => {
    it('returns a date approximately 14 days after last analysis', () => {
      const lastDate = daysAgo(7);
      const result = checkQuota({ total_count: 1, last_analyzed_at: lastDate });
      expect(result.nextAvailableAt).toBeDefined();

      const next = new Date(result.nextAvailableAt!).getTime();
      const expected = new Date(lastDate).getTime() + COOLDOWN_MS;
      expect(Math.abs(next - expected)).toBeLessThan(1000); // within 1s
    });
  });
});
