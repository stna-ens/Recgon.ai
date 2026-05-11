// Phase 1 / Plan 01-02 / Task 2.2 — interest-nudge in scoreTeammateForTask.
//
// D-03 / Pitfall 3: the interest-nudge is the ONLY allowed math touch in
// Phase 1, applied AFTER the weighted sum, capped ≤ 0.05, and unable to
// flip a strictly better-skill candidate.

import { describe, it, expect } from 'vitest';
import { scoreTeammateForTask } from '../lib/recgon/match';
import type { Scoreable } from '../lib/recgon/match';
import type { Teammate } from '../lib/recgon/types';

// Mirror the factory shape from recgonMatch.test.ts but allow an additive
// `interests` field (Teammate & { interests?: string[] }).
type FactoryTeammate = Scoreable & { interests?: string[] };

function mk(overrides: Partial<FactoryTeammate> = {}): FactoryTeammate {
  const base: Teammate & { stars: number; ratingCount: number; upCount: number; downCount: number; inFlightCount: number; teamRole: 'owner' | 'member' | 'viewer' | null } = {
    id: overrides.id ?? 'tm-1',
    teamId: 't',
    userId: 'u-1',
    displayName: 'Tm',
    avatarColor: null,
    avatarUrl: null,
    title: null,
    skills: ['marketing'],
    capacityHours: 168,
    workingHours: null,
    fitProfile: {},
    status: 'active',
    createdAt: '2026-01-01',
    stars: 3.5,
    ratingCount: 0,
    upCount: 0,
    downCount: 0,
    inFlightCount: 0,
    teamRole: 'member',
  };
  return { ...base, ...overrides } as FactoryTeammate;
}

describe('scoreTeammateForTask — interest-nudge', () => {
  it('Test 1 (cap enforced): nudge difference ≤ 0.05 between matching vs empty interests', () => {
    const withInterest = mk({ id: 'A', skills: ['marketing'], interests: ['video'] });
    const withoutInterest = mk({ id: 'B', skills: ['marketing'], interests: [] });
    const task = {
      kind: 'marketing' as const,
      requiredSkills: ['marketing', 'video'],
      estimatedHours: 1,
    };
    const sWith = scoreTeammateForTask(withInterest, task);
    const sWithout = scoreTeammateForTask(withoutInterest, task);
    const diff = sWith.score - sWithout.score;
    expect(diff).toBeGreaterThan(0); // nudge applied
    expect(diff).toBeLessThanOrEqual(0.05); // D-03 hard cap
  });

  it('Test 2 (after-the-sum ordering): final score = base + nudge (additive, not multiplicative)', () => {
    // Two candidates with identical skill overlap + identical everything else.
    // Only difference: one has matching interest, the other does not.
    const a = mk({ id: 'A', skills: ['marketing'], interests: ['video'] });
    const b = mk({ id: 'B', skills: ['marketing'], interests: [] });
    const task = {
      kind: 'marketing' as const,
      requiredSkills: ['marketing', 'video'],
      estimatedHours: 1,
    };
    const sA = scoreTeammateForTask(a, task);
    const sB = scoreTeammateForTask(b, task);
    // Their weighted-sum components must match exactly (identical inputs).
    expect(sA.breakdown.skillOverlap).toBeCloseTo(sB.breakdown.skillOverlap, 10);
    expect(sA.breakdown.fitForKind).toBeCloseTo(sB.breakdown.fitForKind, 10);
    expect(sA.breakdown.availabilityNow).toBeCloseTo(sB.breakdown.availabilityNow, 10);
    expect(sA.breakdown.loadHeadroom).toBeCloseTo(sB.breakdown.loadHeadroom, 10);
    // The difference is therefore EXACTLY the interest nudge — additive.
    const expectedDelta = (sA.breakdown.interestNudge ?? 0) - (sB.breakdown.interestNudge ?? 0);
    expect(sA.score - sB.score).toBeCloseTo(expectedDelta, 10);
    // And the nudge is reported separately in the breakdown.
    expect(sA.breakdown.interestNudge).toBeGreaterThan(0);
    expect(sB.breakdown.interestNudge ?? 0).toBe(0);
  });

  it('Test 3 (no flip on strict-better-skills): nudge cannot overturn a strictly better skill overlap', () => {
    // A has both task skills; no interest.
    // B has only one task skill but matching interest.
    // A must still win — interest-nudge is a tiebreaker, not a flip.
    const a = mk({ id: 'A', skills: ['frontend', 'backend'], interests: [] });
    const b = mk({ id: 'B', skills: ['frontend'], interests: ['video'] });
    const task = {
      kind: 'marketing' as const,
      requiredSkills: ['frontend', 'backend', 'video'],
      estimatedHours: 1,
    };
    const sA = scoreTeammateForTask(a, task);
    const sB = scoreTeammateForTask(b, task);
    expect(sA.score).toBeGreaterThan(sB.score);
  });

  it('Test 4 (no nudge without overlap): interest set disjoint from task tags → no bonus', () => {
    const withMismatchedInterest = mk({ id: 'A', skills: ['marketing'], interests: ['video'] });
    const baseline = mk({ id: 'B', skills: ['marketing'], interests: [] });
    const task = {
      kind: 'marketing' as const,
      requiredSkills: ['marketing'], // no 'video' here
      estimatedHours: 1,
    };
    const sA = scoreTeammateForTask(withMismatchedInterest, task);
    const sB = scoreTeammateForTask(baseline, task);
    expect(sA.score).toBeCloseTo(sB.score, 10);
    expect(sA.breakdown.interestNudge ?? 0).toBe(0);
  });

  it('Test 5 (back-compat): teammate with undefined interests scores same as pre-change baseline', () => {
    // Simulate an OLD caller (no profileMerge) — teammate has no `interests` field at all.
    const oldCaller = mk({ id: 'old', skills: ['marketing'], interests: undefined });
    const task = {
      kind: 'marketing' as const,
      requiredSkills: ['marketing'],
      estimatedHours: 1,
    };
    const result = scoreTeammateForTask(oldCaller, task);
    // No nudge applied → interestNudge field is 0 in breakdown.
    expect(result.breakdown.interestNudge ?? 0).toBe(0);
    // And the final score equals the existing weighted-sum exactly.
    const expectedBase =
      0.45 * result.breakdown.skillOverlap +
      0.3 * result.breakdown.fitForKind +
      0.15 * result.breakdown.availabilityNow +
      0.1 * result.breakdown.loadHeadroom;
    expect(result.score).toBeCloseTo(expectedBase, 10);
  });
});
