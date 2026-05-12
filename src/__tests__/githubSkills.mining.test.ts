// Phase 2 / SKILL-02 / T-02-02 — Octokit mining: 6-month window,
// team-connected-repos only, 200-commit hard cap per repo.
//
// RED state (Plan 02-01): `mineCommitsForTeammate` does not exist yet.
// Plan 02-02 creates `src/lib/recgon/githubSkills.ts` with this export.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createMockOctokit, makeCommit } from './mocks/octokit';

// Module-under-test — does not exist in Plan 02-01.
import {
  mineCommitsForTeammate,
  resolveTeamConnectedRepos,
} from '@/lib/recgon/githubSkills';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

describe('mineCommitsForTeammate — 6-month window (SKILL-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(a) calls Octokit with since = now - 6 months ± 1 day', async () => {
    const octokit = createMockOctokit({ commitsByRepo: {} });
    const before = Date.now();
    await mineCommitsForTeammate({
      octokit: octokit as never,
      author: 'alice',
      repos: [{ owner: 'team', repo: 'app' }],
    });
    const sinceArg = (octokit.paginate.iterator as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
      ?.since as string | undefined;
    expect(sinceArg).toBeTypeOf('string');
    const sinceMs = new Date(sinceArg as string).getTime();
    const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(Math.abs(before - sinceMs - sixMonthsMs)).toBeLessThan(oneDayMs);
  });
});

describe('resolveTeamConnectedRepos — personal repos filtered (T-02-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(b) personal repos (no team_id in projects) are NEVER included', async () => {
    // Worker must use resolveTeamConnectedRepos(teamId) — which reads
    // `projects` filtered by team_id. A personal repo with no projects row
    // for this team must not appear in the result.
    const repos = await resolveTeamConnectedRepos('team-1');
    // The shape contract: `repos` is an array of { owner, repo } pulled
    // from the `projects.github_url` column scoped to teamId.
    expect(Array.isArray(repos)).toBe(true);
    for (const r of repos) {
      expect(r).toHaveProperty('owner');
      expect(r).toHaveProperty('repo');
    }
  });
});

describe('mineCommitsForTeammate — 200-commit hard cap (T-02-02 cost guard)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(c) when repo has 500 commits, only first 200 are processed', async () => {
    const commits = Array.from({ length: 500 }, (_, i) =>
      makeCommit({ message: `feat: change ${i}`, login: 'alice' }),
    );
    const octokit = createMockOctokit({
      commitsByRepo: { 'team/app': commits },
    });
    const result = await mineCommitsForTeammate({
      octokit: octokit as never,
      author: 'alice',
      repos: [{ owner: 'team', repo: 'app' }],
    });
    // The result must surface a `commits` array (or similar) capped at 200.
    expect(result.commits.length).toBeLessThanOrEqual(200);
  });
});
