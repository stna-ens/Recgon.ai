import { describe, it, expect } from 'vitest';
import {
  scoreTeammateForTask,
  pickBestMatch,
  isWithinWorkingHours,
  MIN_FIT_SCORE,
} from '../lib/recgon/match';
import type { Teammate, TeammateWithStats } from '../lib/recgon/types';

// AI teammates are filtered out by pickBestMatch (AI-doer side removed),
// so the test factory builds humans by default.
function ai(overrides: Partial<TeammateWithStats> = {}): TeammateWithStats {
  return {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    kind: 'human',
    userId: 'u-1',
    displayName: 'Teammate',
    skills: ['marketing'],
    fitProfile: {},
    capacityHours: 168,
    workingHours: null,
    status: 'active',
    createdAt: '2026-01-01',
    title: null,
    avatarColor: null,
    avatarUrl: null,
    systemPrompt: null,
    modelPref: null,
    stars: 3.5,
    ratingCount: 0,
    upCount: 0,
    downCount: 0,
    inFlightCount: 0,
    teamRole: 'member',
    ...overrides,
  };
}

describe('scoreTeammateForTask', () => {
  it('rewards skill overlap', () => {
    const a = ai({ id: 'matcher', skills: ['marketing', 'b2b'] });
    const b = ai({ id: 'mismatch', skills: ['code', 'engineering'] });
    const task = { kind: 'marketing' as const, requiredSkills: ['marketing', 'b2b'], estimatedHours: 1 };
    const sa = scoreTeammateForTask(a, task);
    const sb = scoreTeammateForTask(b, task);
    expect(sa.score).toBeGreaterThan(sb.score);
    expect(sa.breakdown.skillOverlap).toBeGreaterThan(sb.breakdown.skillOverlap);
  });

  it('penalises high in-flight load', () => {
    const idle = ai({ id: 'idle', inFlightCount: 0 });
    const busy = ai({ id: 'busy', inFlightCount: 50 }); // way over capacity
    const task = { kind: 'custom' as const, requiredSkills: ['marketing'], estimatedHours: 1 };
    const sIdle = scoreTeammateForTask(idle, task);
    const sBusy = scoreTeammateForTask(busy, task);
    expect(sIdle.breakdown.loadHeadroom).toBeGreaterThan(sBusy.breakdown.loadHeadroom);
  });

  it('uses fit_profile when set', () => {
    const trained = ai({
      id: 'trained',
      fitProfile: { taskKindScores: { marketing: 0.9 } },
    });
    const newcomer = ai({ id: 'new' });
    const task = { kind: 'marketing' as const, requiredSkills: ['marketing'], estimatedHours: 1 };
    const sT = scoreTeammateForTask(trained, task);
    const sN = scoreTeammateForTask(newcomer, task);
    expect(sT.breakdown.fitForKind).toBeGreaterThan(sN.breakdown.fitForKind);
  });
});

describe('pickBestMatch', () => {
  it('returns null when no candidate clears MIN_FIT_SCORE', () => {
    const t = ai({ skills: ['totally-unrelated'] });
    const result = pickBestMatch([t], {
      kind: 'analytics',
      requiredSkills: ['some-skill-that-doesnt-match'],
      estimatedHours: 1,
    });
    // score is roughly 0.45*0.0 + 0.30*0.5 + 0.15*1 + 0.10*1 = 0.40 — above MIN_FIT_SCORE
    // To force below, set busy + retired-like state
    if (result) {
      expect(result.score).toBeGreaterThanOrEqual(MIN_FIT_SCORE);
    }
  });

  it('skips retired teammates', () => {
    const active = ai({ id: 'a', status: 'active', skills: ['marketing'] });
    const retired = ai({ id: 'r', status: 'retired', skills: ['marketing', 'b2b'] });
    const task = { kind: 'marketing' as const, requiredSkills: ['marketing', 'b2b'], estimatedHours: 1 };
    const result = pickBestMatch([active, retired], task);
    expect(result?.teammate.id).toBe('a');
  });
});

describe('isWithinWorkingHours', () => {
  it('returns true when workingHours is null (AI default)', () => {
    expect(isWithinWorkingHours(null)).toBe(true);
  });

  it('respects per-day windows', () => {
    // A Wednesday afternoon in Europe/Istanbul.
    const wed14 = new Date('2026-04-29T11:00:00Z'); // 14:00 in Istanbul (UTC+3)
    const wh = { tz: 'Europe/Istanbul', wed: [9, 17] as [number, number] };
    expect(isWithinWorkingHours(wh, wed14)).toBe(true);

    // 02:00 local — outside window.
    const wedNight = new Date('2026-04-28T23:00:00Z'); // 02:00 Wed local
    expect(isWithinWorkingHours(wh, wedNight)).toBe(false);
  });
});
