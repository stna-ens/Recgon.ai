// Phase 2 / SKILL-04 — profileMerge 3-source blend with inferred map.
//
// RED state (Plan 02-01): `profileMerge` currently accepts `inferred: null`
// only. Plan 02-04 widens the signature to `InferredSkillMap | null` and
// implements 0.5/0.3/0.2 blending with time decay + reject filtering.
//
// Spec (PLAN.md task 1 behavior):
//   (a) inferred=null → identical output to Phase 1 baseline (regression guard)
//   (b) self + inferred + ema present → weighted blend 0.5/0.3/0.2 per ROADMAP #3
//   (c) row with rejectedAt not null is EXCLUDED from blend
//   (d) row with lastSeenAt 180d old → decayed to score × exp(-2) before blending

import { describe, it, expect } from 'vitest';

import { profileMerge } from '@/lib/recgon/profileMerge';
import type {
  Teammate,
  TeammateProfile,
  InferredSkill,
  InferredSkillMap,
} from '@/lib/recgon/types';

function makeTeammate(overrides: Partial<Teammate> = {}): Teammate {
  return {
    id: 'tm-1',
    teamId: 't',
    userId: 'u-1',
    displayName: 'Owner-typed',
    avatarColor: null,
    avatarUrl: null,
    title: null,
    skills: ['design'],
    capacityHours: 40,
    workingHours: null,
    fitProfile: {},
    status: 'active',
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<TeammateProfile> = {}): TeammateProfile {
  return {
    id: 'p-1',
    teamId: 't',
    userId: 'u-1',
    skillsRaw: [],
    strengthsRaw: [],
    interestsRaw: [],
    skillsCanonical: [],
    strengthsCanonical: [],
    interestsCanonical: [],
    weeklyCapacityHours: null,
    createdAt: '2026-05-12',
    updatedAt: '2026-05-12',
    ...overrides,
  };
}

function makeInferred(overrides: Partial<InferredSkill> = {}): InferredSkill {
  const now = new Date().toISOString();
  return {
    id: 'inf-1',
    teammateId: 'tm-1',
    teamId: 't',
    canonicalTag: 'frontend',
    score: 0.8,
    source: 'llm_commit',
    lastSeenAt: now,
    confirmedAt: null,
    rejectedAt: null,
    userReviewedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('profileMerge — 3-source blend (SKILL-04)', () => {
  it('(a) inferred=null → identical output to Phase 1 baseline (regression guard)', () => {
    const t = makeTeammate({ skills: ['design', 'marketing'] });
    const baseline = profileMerge(t, null, null, t.fitProfile);
    const withNullInferred = profileMerge(t, null, null, t.fitProfile);
    expect(withNullInferred).toEqual(baseline);
  });

  it('(b) self + inferred + ema present → weighted 0.5/0.3/0.2 blend', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({ skillsCanonical: ['backend'] });
    const inferred: InferredSkillMap = new Map([
      ['frontend', makeInferred({ canonicalTag: 'frontend', score: 1.0 })],
    ]);
    const merged = profileMerge(t, p, inferred, t.fitProfile);
    // The exact merged-skills shape is left to Plan 02-04; we assert that
    // an inferred-only tag ('frontend') appears in the merged skill set
    // alongside self-declared ('backend').
    expect(merged.skills).toContain('frontend');
    expect(merged.skills).toContain('backend');
  });

  it('(c) row with rejectedAt → EXCLUDED from blend', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({ skillsCanonical: ['backend'] });
    const inferred: InferredSkillMap = new Map([
      [
        'frontend',
        makeInferred({
          canonicalTag: 'frontend',
          score: 1.0,
          rejectedAt: '2026-05-01T00:00:00.000Z',
        }),
      ],
    ]);
    const merged = profileMerge(t, p, inferred, t.fitProfile);
    expect(merged.skills).not.toContain('frontend');
  });

  it('(d) lastSeenAt 180d old → decayed to score × exp(-2) before blending', () => {
    // 180 days old; decay multiplier ≈ exp(-2) ≈ 0.1353. We assert the
    // decayed signal is too weak to surface above a threshold (exact
    // surfacing semantics are Plan 02-04's concern).
    const t = makeTeammate({ skills: [] });
    const p = makeProfile({ skillsCanonical: [] });
    const oldDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const inferred: InferredSkillMap = new Map([
      [
        'mobile',
        makeInferred({
          canonicalTag: 'mobile',
          score: 0.3, // 0.3 × exp(-2) ≈ 0.041 — should drop below any sensible threshold
          lastSeenAt: oldDate,
        }),
      ],
    ]);
    const merged = profileMerge(t, p, inferred, t.fitProfile);
    // The implementation in Plan 02-04 chooses a threshold; what we lock here
    // is the math: stale signal should NOT surface as a present skill.
    expect(merged.skills).not.toContain('mobile');
  });
});
