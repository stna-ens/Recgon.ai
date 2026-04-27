import { describe, it, expect } from 'vitest';
import { updateScore, applyRatingToProfile } from '../lib/recgon/learn';

describe('learn.updateScore (EMA)', () => {
  it('starts at 0 when no prior', () => {
    // 0 * 0.7 + 1 * 0.3 = 0.3
    expect(updateScore(undefined, 1)).toBeCloseTo(0.3, 5);
  });

  it('moves toward +1 with repeated thumbs up', () => {
    let s: number | undefined;
    for (let i = 0; i < 10; i++) s = updateScore(s, 1);
    expect(s).toBeGreaterThan(0.95);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('moves toward -1 with repeated thumbs down', () => {
    let s: number | undefined;
    for (let i = 0; i < 10; i++) s = updateScore(s, -1);
    expect(s).toBeLessThan(-0.95);
    expect(s).toBeGreaterThanOrEqual(-1);
  });

  it('downvote pulls a maxed-out positive score back', () => {
    let s: number | undefined;
    for (let i = 0; i < 10; i++) s = updateScore(s, 1);
    const after = updateScore(s, -1);
    expect(after).toBeLessThan(s as number);
  });

  it('clamps to [-1, 1]', () => {
    expect(updateScore(2, 1)).toBeLessThanOrEqual(1);
    expect(updateScore(-2, -1)).toBeGreaterThanOrEqual(-1);
  });
});

describe('learn.applyRatingToProfile', () => {
  it('only touches the rated kind', () => {
    const before = { taskKindScores: { marketing: 0.5, dev_prompt: -0.2 } };
    const after = applyRatingToProfile(before, 'marketing', 1);
    expect(after.taskKindScores!.dev_prompt).toBe(-0.2);
    expect(after.taskKindScores!.marketing).toBeGreaterThan(0.5);
  });

  it('initialises a missing kind from neutral', () => {
    const after = applyRatingToProfile({}, 'analytics', 1);
    expect(after.taskKindScores!.analytics).toBeCloseTo(0.3, 5);
  });

  it('stamps lastUpdated', () => {
    const after = applyRatingToProfile(null, 'custom', -1);
    expect(typeof after.lastUpdated).toBe('string');
    expect(new Date(after.lastUpdated!).toString()).not.toBe('Invalid Date');
  });
});
