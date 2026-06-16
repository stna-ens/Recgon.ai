// Entity resolvers — name-first lookup with UUID, exact, substring, and
// disambiguation behavior. These power plain-language commands like
// "assign the login bug to Alice".

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockListTasks = vi.fn();
const mockListTeammates = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listTasks: (...a: unknown[]) => mockListTasks(...a),
  listTeammates: (...a: unknown[]) => mockListTeammates(...a),
}));

const mockGetTeamMembers = vi.fn();
const mockGetUserTeams = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  getTeamMembers: (...a: unknown[]) => mockGetTeamMembers(...a),
  getUserTeams: (...a: unknown[]) => mockGetUserTeams(...a),
}));

vi.mock('@/lib/tools/resolveProject', () => ({ resolveProject: vi.fn() }));

import { resolveTask, resolveTeammate, resolveMember } from '@/lib/tools/resolvers';

const UUID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => vi.clearAllMocks());

describe('resolveTask', () => {
  beforeEach(() => {
    mockListTasks.mockResolvedValue([
      { id: UUID, title: 'Fix login bug' },
      { id: 'aaaaaaaa-2222-3333-4444-555555555555', title: 'Write API docs' },
      { id: 'bbbbbbbb-2222-3333-4444-555555555555', title: 'Fix logout bug' },
    ]);
  });

  it('matches by exact title (case-insensitive)', async () => {
    const t = await resolveTask('write api docs', 't1');
    expect(t.title).toBe('Write API docs');
  });

  it('matches by UUID', async () => {
    const t = await resolveTask(UUID, 't1');
    expect(t.title).toBe('Fix login bug');
  });

  it('matches by unique substring', async () => {
    const t = await resolveTask('login', 't1');
    expect(t.title).toBe('Fix login bug');
  });

  it('throws a disambiguation error on multiple substring matches', async () => {
    await expect(resolveTask('Fix', 't1')).rejects.toThrow(/matched multiple/i);
  });

  it('throws not-found with available titles', async () => {
    await expect(resolveTask('nonexistent', 't1')).rejects.toThrow(/No task matching/i);
  });

  it('fuzzily matches an approximate description by word overlap', async () => {
    mockListTasks.mockResolvedValue([
      { id: 'a', title: 'Security review of the API' },
      { id: 'b', title: 'Write onboarding docs' },
    ]);
    // Not a substring of either title, but shares the word "security".
    const t = await resolveTask('make the security thing', 't1');
    expect(t.id).toBe('a');
  });

  it('matches when the user over-describes a short title (reverse substring)', async () => {
    mockListTasks.mockResolvedValue([{ id: 'a', title: 'login bug' }]);
    const t = await resolveTask('please fix the login bug today', 't1');
    expect(t.id).toBe('a');
  });
});

describe('resolveTeammate', () => {
  it('matches by display name substring', async () => {
    mockListTeammates.mockResolvedValue([
      { id: 't-1', displayName: 'Alice Chen' },
      { id: 't-2', displayName: 'Bob Stone' },
    ]);
    const m = await resolveTeammate('alice', 't1');
    expect(m.id).toBe('t-1');
  });

  it('tolerates a nickname typo (grr8 → gr8)', async () => {
    mockListTeammates.mockResolvedValue([
      { id: 't-1', displayName: 'gr8' },
      { id: 't-2', displayName: 'AlpBora' },
    ]);
    const m = await resolveTeammate('grr8', 't1');
    expect(m.id).toBe('t-1');
  });
});

describe('resolveMember', () => {
  it('matches by email and returns a label', async () => {
    mockGetTeamMembers.mockResolvedValue([
      { userId: 'u-1', nickname: 'Alice', email: 'alice@example.com', role: 'owner' },
      { userId: 'u-2', nickname: 'Bob', email: 'bob@example.com', role: 'member' },
    ]);
    const r = await resolveMember('bob@example.com', 't1');
    expect(r.member.userId).toBe('u-2');
    expect(r.label).toBe('Bob');
  });
});
