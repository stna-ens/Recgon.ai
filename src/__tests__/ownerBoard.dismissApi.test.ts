// Phase 3.5 / Plan 03.5-03 — owner-dock-dismiss endpoint contract tests.
//
// Scenarios (matching Plan 03.5-03 Task 1 behavior block):
//   1. Unauthenticated POST → 401.
//   2. Member POST → 403.
//   3. Viewer POST → 403.
//   4. Owner of a different team than the task → 403 (verifyTeamAccess returns null).
//   5. Missing taskId in body → 400.
//   5b. Non-string taskId in body → 400.
//   6. Non-existent taskId → 404.
//   7. Owner dismisses a deferred task → 200, dismissDockItem called once.
//   8. Owner dismisses the same task twice → both 200 (idempotent upsert).
//  10. Owner tries to dismiss a triaged task → 400 ("only deferred tasks can be dismissed").
//
// Test 9 (storage-helper filter) lives in `ownerBoard.dismissFilter.test.ts`
// because it requires a different module-level mock topology (real storage,
// mocked supabase) than the endpoint tests (mocked storage).

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockGetTask = vi.fn();
const mockDismissDockItem = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  dismissDockItem: (...args: unknown[]) => mockDismissDockItem(...args),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

const teamId = 'team-1';
const taskId = 'task-deferred';
const ownerUserId = 'user-owner';
const memberUserId = 'user-member';
const viewerUserId = 'user-viewer';

const deferredTaskFixture = {
  id: taskId,
  teamId,
  title: 'Investigate prod log',
  status: 'unassigned' as const,
  triageNote: null,
  scheduledDate: '2026-05-22',
};

const triagedTaskFixture = {
  ...deferredTaskFixture,
  id: 'task-triaged',
  triageNote: 'no_clear_fit' as const,
  scheduledDate: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockDismissDockItem.mockResolvedValue(undefined);
});

async function callPOST(body: unknown) {
  const { POST } = await import('@/app/api/recgon/owner/dock/dismiss/route');
  return POST(
    new Request('http://localhost/api/recgon/owner/dock/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/recgon/owner/dock/dismiss — owner-dock dismiss endpoint', () => {
  it('Test 1: unauthenticated → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callPOST({ taskId });
    expect(res.status).toBe(401);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 2: member POSTs → 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: memberUserId } });
    mockGetTask.mockResolvedValue(deferredTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('member');

    const res = await callPOST({ taskId });
    expect(res.status).toBe(403);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 3: viewer POSTs → 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: viewerUserId } });
    mockGetTask.mockResolvedValue(deferredTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('viewer');

    const res = await callPOST({ taskId });
    expect(res.status).toBe(403);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 4: owner of a different team than the task → 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(deferredTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue(null);

    const res = await callPOST({ taskId });
    expect(res.status).toBe(403);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 5: missing taskId → 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });

    const res = await callPOST({});
    expect(res.status).toBe(400);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 5b: non-string taskId → 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });

    const res = await callPOST({ taskId: 123 });
    expect(res.status).toBe(400);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 6: non-existent taskId → 404', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(null);

    const res = await callPOST({ taskId: 'task-missing' });
    expect(res.status).toBe(404);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });

  it('Test 7: owner dismisses a deferred task → 200, dismissDockItem called once', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(deferredTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ taskId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockDismissDockItem).toHaveBeenCalledTimes(1);
    expect(mockDismissDockItem).toHaveBeenCalledWith(ownerUserId, taskId);
  });

  it('Test 8: owner dismisses the same task twice → both 200 (idempotent)', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(deferredTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res1 = await callPOST({ taskId });
    const res2 = await callPOST({ taskId });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockDismissDockItem).toHaveBeenCalledTimes(2);
  });

  it('Test 10: triaged task → 400 with "only deferred tasks can be dismissed"', async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerUserId } });
    mockGetTask.mockResolvedValue(triagedTaskFixture);
    mockVerifyTeamAccess.mockResolvedValue('owner');

    const res = await callPOST({ taskId: 'task-triaged' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only deferred tasks can be dismissed/i);
    expect(mockDismissDockItem).not.toHaveBeenCalled();
  });
});
