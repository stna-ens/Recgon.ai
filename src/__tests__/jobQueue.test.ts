import { describe, it, expect } from 'vitest';
import { __testing } from '../lib/llm/jobQueue';

const { nextRetryAt, BACKOFF_SECONDS } = __testing;

describe('jobQueue backoff', () => {
  it('first retry waits the first bucket', () => {
    const before = Date.now();
    const iso = nextRetryAt(1);
    const after = Date.now();
    const ms = new Date(iso).getTime();
    // Attempt 1 → bucket[0] = 60s
    expect(ms).toBeGreaterThanOrEqual(before + BACKOFF_SECONDS[0] * 1000 - 50);
    expect(ms).toBeLessThanOrEqual(after + BACKOFF_SECONDS[0] * 1000 + 50);
  });

  it('later retries ramp up but cap at the final bucket', () => {
    const iso1 = nextRetryAt(1);
    const iso3 = nextRetryAt(3);
    const iso12 = nextRetryAt(12);
    const iso20 = nextRetryAt(20); // Far past max_attempts — should cap, not throw

    const ms1 = new Date(iso1).getTime();
    const ms3 = new Date(iso3).getTime();
    const ms12 = new Date(iso12).getTime();
    const ms20 = new Date(iso20).getTime();

    expect(ms3).toBeGreaterThan(ms1);
    expect(ms12).toBeGreaterThan(ms3);
    // ms12 and ms20 should both use the last bucket (cap), so within ~1s of each other
    expect(Math.abs(ms20 - ms12)).toBeLessThan(1000);
  });

  it('total backoff window covers several hours', () => {
    const totalSeconds = BACKOFF_SECONDS.reduce((a, b) => a + b, 0);
    // Plan target: ~multi-hour retry horizon
    expect(totalSeconds).toBeGreaterThan(3 * 3600);
  });
});
