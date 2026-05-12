// Phase 2 (SKILL-02) shared Octokit mock seam. Reused by:
//   - githubSkills.consent.test.ts (Plan 02 — RED until worker lands)
//   - githubSkills.mining.test.ts
//   - githubSkills.empty.test.ts
//
// The shape mirrors @octokit/rest's REST surface for `repos.listCommits`
// + the throttle / paginate plugin hooks so the worker code under test
// can swap a real Octokit instance for this one without code changes.

import { vi } from 'vitest';

/**
 * Minimal Octokit commit shape — enough for the worker to extract title +
 * author + date. Mirrors the fields the worker reads at evidenceSources.ts:
 * `commit.sha`, `commit.commit.message`, `commit.commit.author.date`,
 * `commit.author.login`.
 */
export type MockCommit = {
  sha: string;
  commit: {
    message: string;
    author: { date: string; name?: string; email?: string } | null;
    committer?: { date: string; name?: string; email?: string } | null;
  };
  author: { login: string } | null;
};

export type MockThrottleHooks = {
  onRateLimit?: (
    retryAfter: number,
    options: unknown,
    octokit: unknown,
    retryCount: number,
  ) => boolean;
  onSecondaryRateLimit?: (
    retryAfter: number,
    options: unknown,
    octokit: unknown,
    retryCount: number,
  ) => boolean;
};

export type MockOctokitOptions = {
  /** Commits keyed by `${owner}/${repo}` */
  commitsByRepo: Record<string, MockCommit[]>;
  /** Optional override of the default paginate.iterator behavior */
  paginateImpl?: (
    method: unknown,
    params: { owner: string; repo: string; per_page?: number; author?: string; since?: string },
  ) => AsyncIterable<{ data: MockCommit[] }>;
  throttleHooks?: MockThrottleHooks;
  /** Optional override for repos.listLanguages */
  languagesByRepo?: Record<string, Record<string, number>>;
};

export type MockOctokit = {
  rest: {
    repos: {
      listCommits: ReturnType<typeof vi.fn>;
      listLanguages: ReturnType<typeof vi.fn>;
    };
  };
  paginate: {
    iterator: ReturnType<typeof vi.fn>;
  };
  // Surface the throttle hooks so tests can assert they were registered.
  __throttleHooks?: MockThrottleHooks;
};

/**
 * Build a stub Octokit instance. The worker under test should receive this
 * via dependency injection (factory pattern from PATTERNS.md §githubSkills.ts).
 */
export function createMockOctokit(options: MockOctokitOptions): MockOctokit {
  const { commitsByRepo, paginateImpl, throttleHooks, languagesByRepo } = options;

  function defaultPaginateIterator(
    _method: unknown,
    params: { owner: string; repo: string; per_page?: number },
  ): AsyncIterable<{ data: MockCommit[] }> {
    const key = `${params.owner}/${params.repo}`;
    const commits = commitsByRepo[key] ?? [];
    const pageSize = params.per_page ?? 100;
    // Slice the commits into pages.
    async function* gen() {
      for (let i = 0; i < commits.length; i += pageSize) {
        yield { data: commits.slice(i, i + pageSize) };
      }
    }
    return gen();
  }

  const paginateIterator = vi.fn(
    paginateImpl ?? defaultPaginateIterator,
  );

  const listCommits = vi.fn(
    async (params: { owner: string; repo: string }) => {
      const commits = commitsByRepo[`${params.owner}/${params.repo}`] ?? [];
      return { data: commits };
    },
  );

  const listLanguages = vi.fn(
    async (params: { owner: string; repo: string }) => {
      const langs = languagesByRepo?.[`${params.owner}/${params.repo}`] ?? {};
      return { data: langs };
    },
  );

  return {
    rest: {
      repos: {
        listCommits,
        listLanguages,
      },
    },
    paginate: {
      iterator: paginateIterator,
    },
    __throttleHooks: throttleHooks,
  };
}

/**
 * Build a `MockCommit` with sensible defaults. Tests override only the fields
 * they care about (typically `message` + `author.date`).
 */
export function makeCommit(overrides: Partial<MockCommit> & { message?: string; date?: string; login?: string } = {}): MockCommit {
  const sha = overrides.sha ?? Math.random().toString(16).slice(2, 10);
  const message = overrides.message ?? 'feat: a thing';
  const date = overrides.date ?? new Date().toISOString();
  const login = overrides.login ?? 'alice';
  return {
    sha,
    commit: {
      message,
      author: { date, name: login, email: `${login}@example.com` },
      committer: { date, name: login, email: `${login}@example.com` },
    },
    author: { login },
    ...overrides,
  };
}
