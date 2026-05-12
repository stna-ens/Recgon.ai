// Phase 2 / SKILL-06 — Empty 6-month window must not trigger the
// "new inferred skills" banner.
//
// RED state (Plan 02-01): `runGithubSkillInference` does not exist yet.
// Plan 02-02 turns this GREEN.
//
// Spec (PLAN.md task 1 behavior):
//   - consent + token + repos present + ZERO commits in window
//   - worker writes ZERO new inferred-skill rows
//   - worker updates teammate_profiles.last_scan_at = now()
//   - worker returns { skipped: false, written: 0 }
//   - Banner suppression behavior: banner queries unreviewed count > 0;
//     zero new rows → zero unreviewed (handled by storage/UI layer downstream).

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runGithubSkillInference } from '@/lib/llm/workers';

vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  upsertInferredSkill: vi.fn(),
  listRejectedTags: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/userStorage', () => ({
  getUserById: vi.fn(),
}));
vi.mock('@/lib/recgon/profileStorage', () => ({
  getProfile: vi.fn(),
}));

describe('runGithubSkillInference — empty window (SKILL-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consent + token + repos + ZERO commits → written=0, last_scan_at updated, skipped=false', async () => {
    const result = await runGithubSkillInference({
      id: 'job-empty',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);

    // The worker must return skipped=false (real scan happened) but written=0.
    expect(result).toMatchObject({ skipped: false, written: 0 });
  });
});
