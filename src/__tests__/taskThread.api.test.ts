// Phase B task threads — GET/POST /api/teams/[id]/tasks/[taskId]/comments.
//
// Locks down:
//   1. Event merge is WHITELIST-only and payloads are stripped to safe
//      display keys (no score breakdowns / triage internals leak).
//   2. Viewers can read but not write (canComment false, POST 403).
//   3. @mention parsing resolves team members and fires the email.

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

const mockGetTask = vi.fn();
const mockListTeammates = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  listTeammates: (...args: unknown[]) => mockListTeammates(...args),
}));

const mockListComments = vi.fn();
const mockAddComment = vi.fn();
vi.mock('@/lib/recgon/commentStorage', () => ({
  listComments: (...args: unknown[]) => mockListComments(...args),
  addComment: (...args: unknown[]) => mockAddComment(...args),
  softDeleteComment: vi.fn(),
  COMMENT_MAX_LENGTH: 4000,
}));

const mockNotifyMention = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/notifications', () => ({
  notifyCommentMention: (...args: unknown[]) => mockNotifyMention(...args),
}));

// Table-keyed supabase stub.
const tableData: Record<string, unknown[]> = {};
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const result = { data: tableData[table] ?? [], error: null };
      const single = { data: (tableData[table] ?? [])[0] ?? null, error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => Promise.resolve(result),
        single: () => Promise.resolve(single),
        then: (
          onf: (v: { data: unknown[]; error: null }) => unknown,
          onr?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(onf, onr),
      };
      return chain;
    },
  },
}));

const teamId = 'team-1';
const taskId = 'task-1';

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableData)) delete tableData[k];
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  mockGetTask.mockResolvedValue({ id: taskId, teamId, title: 'Fix auth' });
  mockListTeammates.mockResolvedValue([
    { id: 'tm-1', teamId, userId: 'user-1', displayName: 'Ada' },
    { id: 'tm-2', teamId, userId: 'user-2', displayName: 'Grace' },
  ]);
  mockListComments.mockResolvedValue([]);
});

async function callGET() {
  const { GET } = await import('@/app/api/teams/[id]/tasks/[taskId]/comments/route');
  const params = Promise.resolve({ id: teamId, taskId });
  return GET(new Request('http://localhost/x') as never, { params }) as Promise<Response>;
}

async function callPOST(body: unknown) {
  const { POST } = await import('@/app/api/teams/[id]/tasks/[taskId]/comments/route');
  const params = Promise.resolve({ id: teamId, taskId });
  return POST(
    new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) }) as never,
    { params },
  ) as Promise<Response>;
}

describe('GET thread', () => {
  it('whitelists events and strips payloads to safe display keys', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    tableData['teammate_event_log'] = [
      {
        id: 'e1',
        event: 'snoozed',
        teammate_id: 'tm-1',
        payload: { days: 3, top_breakdown: { skillOverlap: 0.9 }, owner_user_id: 'user-9' },
        ts: '2026-06-10T10:00:00Z',
      },
      // Excluded event types must vanish entirely.
      { id: 'e2', event: 'rated', teammate_id: 'tm-1', payload: { rating: 2 }, ts: '2026-06-10T11:00:00Z' },
      { id: 'e3', event: 'no_fit', teammate_id: null, payload: {}, ts: '2026-06-10T12:00:00Z' },
    ];
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      type: 'event',
      event: 'snoozed',
      actorName: 'Ada',
      detail: { days: 3 },
    });
    const blob = JSON.stringify(body);
    expect(blob).not.toContain('top_breakdown');
    expect(blob).not.toContain('skillOverlap');
    expect(blob).not.toContain('owner_user_id');
    expect(blob).not.toContain('rated');
  });

  it('merges comments chronologically and marks the viewer’s own', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    tableData['users'] = [
      { id: 'user-1', nickname: 'ada' },
      { id: 'user-2', nickname: 'grace' },
    ];
    tableData['teammate_event_log'] = [
      { id: 'e1', event: 'assigned', teammate_id: 'tm-2', payload: {}, ts: '2026-06-10T09:00:00Z' },
    ];
    mockListComments.mockResolvedValue([
      {
        id: 'c1',
        taskId,
        teamId,
        authorUserId: 'user-2',
        body: 'On it.',
        mentions: [],
        createdAt: '2026-06-10T10:00:00Z',
        editedAt: null,
        deletedAt: null,
      },
      {
        id: 'c2',
        taskId,
        teamId,
        authorUserId: 'user-1',
        body: 'Deleted one',
        mentions: [],
        createdAt: '2026-06-10T11:00:00Z',
        editedAt: null,
        deletedAt: '2026-06-10T12:00:00Z',
      },
    ]);
    const res = await callGET();
    const body = await res.json();
    // Deleted comment excluded; event first (earlier ts).
    expect(body.items.map((i: { type: string }) => i.type)).toEqual(['event', 'comment']);
    expect(body.items[1]).toMatchObject({ authorName: 'grace', mine: false });
    expect(body.canComment).toBe(true);
  });

  it('viewer can read but canComment is false', async () => {
    mockVerifyTeamAccess.mockResolvedValue('viewer');
    const res = await callGET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.canComment).toBe(false);
  });
});

describe('POST comment', () => {
  it('viewer is rejected with 403', async () => {
    mockVerifyTeamAccess.mockResolvedValue('viewer');
    const res = await callPOST({ body: 'hey' });
    expect(res.status).toBe(403);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('parses @mentions and fires the email to the mentioned member only', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    tableData['users'] = [
      { id: 'user-1', nickname: 'ada', email: 'ada@x.com' },
      { id: 'user-2', nickname: 'grace', email: 'grace@x.com' },
    ];
    tableData['teams'] = [{ name: 'Crew' }];
    mockAddComment.mockResolvedValue({
      id: 'c9',
      taskId,
      teamId,
      authorUserId: 'user-1',
      body: 'ping @grace can you take a look?',
      mentions: ['user-2'],
      createdAt: '2026-06-12T10:00:00Z',
      editedAt: null,
      deletedAt: null,
    });
    const res = await callPOST({ body: 'ping @grace can you take a look?' });
    expect(res.status).toBe(200);
    expect(mockAddComment).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: ['user-2'], authorUserId: 'user-1' }),
    );
    // Drain the fire-and-forget microtask.
    await Promise.resolve();
    expect(mockNotifyMention).toHaveBeenCalledTimes(1);
    expect(mockNotifyMention).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'grace@x.com', taskTitle: 'Fix auth' }),
    );
  });

  it('rejects empty bodies', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    const res = await callPOST({ body: '   ' });
    expect(res.status).toBe(400);
  });
});
