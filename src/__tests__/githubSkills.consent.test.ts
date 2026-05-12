// Phase 2 / SKILL-01 / T-02-04 — consent gate enforcement.
//
// RED state (Plan 02-01): the worker `runGithubSkillInference` does not exist
// yet. Plan 02-02 turns this GREEN by creating the worker + wiring it into
// `WORKERS` in `src/lib/llm/workers.ts`.
//
// Spec (from PLAN.md task 1 behavior):
//   (a) no consent timestamp → worker returns { skipped: true, reason: 'no_consent' }
//       and writes ZERO rows
//   (b) consent timestamp set but `users.githubAccessToken` null →
//       { skipped: true, reason: 'no_token' }
//   (c) consent + token + 0 repos → { skipped: true, reason: 'no_team_repos' }

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Worker module does not exist yet — this is the RED gate symbol.
// Plan 02-02 will create `src/lib/llm/workers.ts` export `runGithubSkillInference`.
import { runGithubSkillInference } from '@/lib/llm/workers';

// Stubs we'll wire up once the worker has injectable seams.
vi.mock('@/lib/userStorage', () => ({
  getUserById: vi.fn(),
}));
vi.mock('@/lib/recgon/profileStorage', () => ({
  getProfile: vi.fn(),
}));
vi.mock('@/lib/recgon/inferredSkillsStorage', () => ({
  upsertInferredSkill: vi.fn(),
  listRejectedTags: vi.fn().mockResolvedValue([]),
}));

describe('runGithubSkillInference — consent gate (SKILL-01 / T-02-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) no consent timestamp → skipped=true, reason=no_consent, ZERO rows written', async () => {
    // The worker should read teammate_profiles.github_mining_consent_at via
    // getProfile(teamId, userId) and bail when it's null.
    const result = await runGithubSkillInference({
      id: 'job-1',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_consent' });
  });

  it('(b) consent set but no githubAccessToken → skipped=true, reason=no_token', async () => {
    const result = await runGithubSkillInference({
      id: 'job-2',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_token' });
  });

  it('(c) consent + token + zero connected repos → skipped=true, reason=no_team_repos', async () => {
    const result = await runGithubSkillInference({
      id: 'job-3',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_team_repos' });
  });
});
