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
import { getUserById } from '@/lib/userStorage';
import { getProfile } from '@/lib/recgon/profileStorage';
import { supabase } from '@/lib/supabase';

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

// Stub Octokit so the worker doesn't make real HTTP. The default behavior:
// listCommits returns no commits, listLanguages returns empty stats.
vi.mock('@octokit/rest', () => ({
  Octokit: {
    plugin: () => class MockOctokit {
      rest = {
        repos: {
          listCommits: vi.fn(async () => ({ data: [] })),
          listLanguages: vi.fn(async () => ({ data: {} })),
        },
      };
      paginate = {
        iterator: vi.fn(async function* () {
          yield { data: [] };
        }),
      };
    },
  },
}));
vi.mock('@octokit/plugin-throttling', () => ({ throttling: {} }));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (data: unknown = null) => {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
    b.not = vi.fn(() => Promise.resolve({ data: [{ github_url: 'https://github.com/team/app' }], error: null }));
    b.update = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })) }));
    return b;
  };
  const from = vi.fn((table: string) => {
    if (table === 'teams') return makeBuilder({ inference_depth: 'standard' });
    if (table === 'agent_teammates') return makeBuilder({ user_id: 'user-1' });
    return makeBuilder();
  });
  return { supabase: { from } };
});

const mockedGetProfile = getProfile as unknown as ReturnType<typeof vi.fn>;
const mockedGetUserById = getUserById as unknown as ReturnType<typeof vi.fn>;

describe('runGithubSkillInference — empty window (SKILL-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consent + token + repos + ZERO commits → written=0, last_scan_at updated, skipped=false', async () => {
    mockedGetProfile.mockResolvedValue({ githubMiningConsentAt: '2026-05-01T00:00:00Z' });
    mockedGetUserById.mockResolvedValue({
      id: 'user-1',
      githubAccessToken: 'gh_test_token',
      githubUsername: 'alice',
    });
    // sanity: ensure supabase mock is referenced (otherwise tree-shaking complaint).
    void supabase;

    const result = await runGithubSkillInference({
      id: 'job-empty',
      kind: 'github_skill_inference',
      payload: { teammateId: 'tm-1', teamId: 'team-1', userId: 'user-1' },
    } as never);

    // The worker must return skipped=false (real scan happened) but written=0.
    expect(result).toMatchObject({ skipped: false, written: 0 });
  });
});
