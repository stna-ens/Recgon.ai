// Phase 1 / PROFILE-04 / Plan 01-02 / Task 2.1.
//
// `profileMerge` is a pure function: owner row + self-declared profile +
// (Phase 2) inferred + EMA → merged Teammate the dispatcher hands to match.ts.
// Field-level fallback (D-06), null passthrough (D-08), strengths fold into
// skills (D-02), interests carried as additive field for match.ts (D-03).

import { describe, it, expect } from 'vitest';
import { profileMerge } from '../lib/recgon/profileMerge';
import type { Teammate, TeammateProfile } from '../lib/recgon/types';

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

describe('profileMerge', () => {
  it('Test 1 (D-08): returns owner unchanged + empty interests when profile is null', () => {
    const t = makeTeammate({ skills: ['design', 'marketing'], capacityHours: 30 });
    const merged = profileMerge(t, null, null, t.fitProfile);
    expect(merged.skills).toEqual(t.skills);
    expect(merged.capacityHours).toEqual(t.capacityHours);
    expect(merged.interests).toEqual([]);
  });

  it('Test 2 (D-06 field-level, skills filled): self wins; owner skills not merged in', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({ skillsCanonical: ['frontend', 'backend'] });
    const merged = profileMerge(t, p, null, t.fitProfile);
    expect(new Set(merged.skills)).toEqual(new Set(['frontend', 'backend']));
    expect(merged.skills).not.toContain('design');
  });

  it('Test 3 (D-06 field-level, skills blank): fall back to owner skills', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({ skillsCanonical: [], strengthsCanonical: [] });
    const merged = profileMerge(t, p, null, t.fitProfile);
    expect(merged.skills).toEqual(['design']);
  });

  it('Test 4 (D-02 strengths fold): strengths union into skills, dedup', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({
      skillsCanonical: ['frontend', 'backend'],
      strengthsCanonical: ['design', 'frontend'], // 'frontend' dup
    });
    const merged = profileMerge(t, p, null, t.fitProfile);
    expect(new Set(merged.skills)).toEqual(new Set(['frontend', 'backend', 'design']));
    // dedup check: 'frontend' present once
    expect(merged.skills.filter((s) => s === 'frontend').length).toBe(1);
  });

  it('Test 5 (D-06 capacity): profile.weeklyCapacityHours wins when set; falls back when null', () => {
    const t = makeTeammate({ capacityHours: 40 });
    const pSet = makeProfile({ weeklyCapacityHours: 20 });
    expect(profileMerge(t, pSet, null, t.fitProfile).capacityHours).toBe(20);
    const pNull = makeProfile({ weeklyCapacityHours: null });
    expect(profileMerge(t, pNull, null, t.fitProfile).capacityHours).toBe(40);
  });

  it('Test 6 (D-03 interests passthrough): exposes profile.interestsCanonical; [] when null', () => {
    const t = makeTeammate();
    const p = makeProfile({ interestsCanonical: ['video', 'marketing'] });
    const merged = profileMerge(t, p, null, t.fitProfile);
    expect(new Set(merged.interests)).toEqual(new Set(['video', 'marketing']));

    const mergedNull = profileMerge(t, null, null, t.fitProfile);
    expect(mergedNull.interests).toEqual([]);
  });

  it('Test 7 (EMA passthrough): returned object.fitProfile equals the ema argument', () => {
    const t = makeTeammate({ fitProfile: { taskKindScores: { marketing: 0.1 } } });
    const ema = { taskKindScores: { marketing: 0.9 }, lastUpdated: '2026-05-12' };
    const p = makeProfile({ skillsCanonical: ['frontend'] });
    const merged = profileMerge(t, p, null, ema);
    expect(merged.fitProfile).toBe(ema); // reference equality
  });

  it('Test 8 (lowercase normalization): canonical tags lowercased on output', () => {
    const t = makeTeammate({ skills: ['design'] });
    const p = makeProfile({
      skillsCanonical: ['Frontend'],
      strengthsCanonical: ['BACKEND'],
      interestsCanonical: ['Video'],
    });
    const merged = profileMerge(t, p, null, t.fitProfile);
    expect(new Set(merged.skills)).toEqual(new Set(['frontend', 'backend']));
    expect(merged.interests).toContain('video');
  });
});
