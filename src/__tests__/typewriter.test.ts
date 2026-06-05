import { describe, it, expect } from 'vitest';
import {
  charsThisFrame,
  DEFAULT_PACE,
  type PaceConfig,
} from '@/lib/useTypewriter';

const cfg: PaceConfig = DEFAULT_PACE;

describe('charsThisFrame — pure pacing function', () => {
  it('returns 0 only when the buffer is empty', () => {
    expect(charsThisFrame(0, false, cfg)).toBe(0);
    expect(charsThisFrame(0, true, cfg)).toBe(0);
    expect(charsThisFrame(-5, false, cfg)).toBe(0);
  });

  it('always makes forward progress when the buffer is non-empty', () => {
    for (const remaining of [1, 2, 5, 27, 100, 5000]) {
      for (const done of [false, true]) {
        expect(charsThisFrame(remaining, done, cfg)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('holds a steady, near-baseline pace when streaming with a small buffer', () => {
    // Buffer smaller than one pressure unit → exactly baseline.
    expect(charsThisFrame(1, false, cfg)).toBe(cfg.baseline);
    expect(charsThisFrame(cfg.pressureDivisor - 1, false, cfg)).toBe(
      cfg.baseline,
    );
  });

  it('speeds up under buffer pressure while streaming', () => {
    const small = charsThisFrame(10, false, cfg);
    const medium = charsThisFrame(cfg.pressureDivisor * 3, false, cfg);
    const large = charsThisFrame(cfg.pressureDivisor * 8, false, cfg);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it('never exceeds the streaming cap while streaming', () => {
    expect(charsThisFrame(100_000, false, cfg)).toBe(cfg.maxStreaming);
    for (const remaining of [50, 500, 5000, 50_000]) {
      expect(charsThisFrame(remaining, false, cfg)).toBeLessThanOrEqual(
        cfg.maxStreaming,
      );
    }
  });

  it('fast-flushes the whole buffer within ~flushFrames frames when done', () => {
    const remaining = 600;
    const step = charsThisFrame(remaining, true, cfg);
    // Should empty within flushFrames frames (ceil division).
    expect(step * cfg.flushFrames).toBeGreaterThanOrEqual(remaining);
    // And it should be faster than the steady streaming pace for the same buffer.
    expect(step).toBeGreaterThanOrEqual(
      charsThisFrame(remaining, false, cfg),
    );
  });

  it('flushes a typical reply within ~flushFrames frames when done', () => {
    // A typical reply (<= flushFrames * maxStreaming chars) clears within
    // ~flushFrames frames thanks to the maxStreaming floor on the tail.
    let remaining = cfg.flushFrames * cfg.maxStreaming; // 336 by default
    let frames = 0;
    while (remaining > 0) {
      remaining -= charsThisFrame(remaining, true, cfg);
      frames += 1;
      expect(frames).toBeLessThan(200); // never loops forever
    }
    expect(frames).toBeLessThanOrEqual(cfg.flushFrames + 2);
  });

  it('done-mode always terminates even for a very large buffer', () => {
    let remaining = 50_000;
    let frames = 0;
    while (remaining > 0) {
      const step = charsThisFrame(remaining, true, cfg);
      expect(step).toBeGreaterThanOrEqual(1);
      remaining -= step;
      frames += 1;
      expect(frames).toBeLessThan(10_000);
    }
    expect(remaining).toBeLessThanOrEqual(0);
  });

  it('streaming-mode always terminates for any finite buffer', () => {
    let remaining = 5000;
    let frames = 0;
    while (remaining > 0) {
      const step = charsThisFrame(remaining, false, cfg);
      expect(step).toBeGreaterThanOrEqual(1);
      remaining -= step;
      frames += 1;
      expect(frames).toBeLessThan(20_000);
    }
    expect(remaining).toBeLessThanOrEqual(0);
  });
});
