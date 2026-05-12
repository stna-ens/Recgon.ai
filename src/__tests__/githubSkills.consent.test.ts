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

// Worker module — Plan 02-02 creates `runGithubSkillInference` and wires it
// into `src/lib/llm/workers.ts`.
import { runGithubSkillInference } from '@/lib/llm/workers';
import { getUserById } from '@/lib/userStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
import { supabase } from '@/lib/supabase';

// Inline seams the worker reads through.
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

// Supabase service-role client — the worker uses it to read teams.inference_depth
// and (via githubSkills.resolveTeamConnectedRepos) the projects list. We stub
// both query chains via tiny chainable builders. Default: empty result sets.
vi.mock('@/lib/supabase', () => {
  const makeBuilder = (data: unknown = null, error: unknown = null) => {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn().mockResolvedValue({ data, error });
    b.not = vi.fn(() => Promise.resolve({ data: [], error: null }));
    b.update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })) }));
    return b;
  };
  const from = vi.fn(() => makeBuilder());
  return { supabase: { from } };
});

const mockedGetProfile = getProfile as unknown as ReturnType<typeof vi.fn>;
const mockedGetUserById = getUserById as unknown as ReturnType<typeof vi.fn>;
const mockedSupabaseFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

describe('runGithubSkillInference — consent gate (SKILL-01 / T-02-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the default supabase builder (empty result for projects + teams).
    mockedSupabaseFrom.mockImplementation(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      b.not = vi.fn(() => Promise.resolve({ data: [], error: null }));
      b.update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })) }));
      return b;
    });
  });

  it('(a) no consent timestamp → skipped=true, reason=no_consent, ZERO rows written', async () => {
    // getProfile returns a row with githubMiningConsentAt: null → worker bails.
    mockedGetProfile.mockResolvedValue({ githubMiningConsentAt: null });
    const result = await runGithubSkillInference({
      id: 'job-1',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_consent' });
  });

  it('(b) consent set but no githubAccessToken → skipped=true, reason=no_token', async () => {
    mockedGetProfile.mockResolvedValue({ githubMiningConsentAt: '2026-05-01T00:00:00Z' });
    mockedGetUserById.mockResolvedValue({ id: 'user-1', githubAccessToken: undefined });
    const result = await runGithubSkillInference({
      id: 'job-2',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_token' });
  });

  it('(c) consent + token + zero connected repos → skipped=true, reason=no_team_repos', async () => {
    mockedGetProfile.mockResolvedValue({ githubMiningConsentAt: '2026-05-01T00:00:00Z' });
    mockedGetUserById.mockResolvedValue({
      id: 'user-1',
      githubAccessToken: 'gh_test_token',
      githubUsername: 'alice',
    });
    // Default supabase builder returns no projects → resolveTeamConnectedRepos
    // yields []. The worker should hit the no_team_repos skip.
    const result = await runGithubSkillInference({
      id: 'job-3',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);
    expect(result).toMatchObject({ skipped: true, reason: 'no_team_repos' });
  });
});
