// Phase 3.5 / Plan 03.5-02 — Owner-only GET /api/recgon/owner/dock contract.
//
// Scenarios:
//   1. Unauthenticated → 401.
//   2. Authenticated as member → 403.
//   3. Authenticated as viewer → 403.
//   4. Authenticated as owner of DIFFERENT team (no role for THIS team) → 403.
//   5. Missing teamId query param → 400.
//   6. teamId present but team doesn't exist (verifyTeamAccess returns null) → 403.
//   7. Owner of empty team → 200 with `{ triaged: [], deferred: [] }`.
//   8. Owner of populated team → triaged + deferred arrays populated;
//      normal assigned tasks NOT in either array (storage helper boundary).
//
// Mirrors `src/__tests__/tasks.manualAssign.api.test.ts` mocking layout.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { triagedTask, deferredTask, assignedTask } from './ownerBoard/setup';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockListOwnerDockTasks = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listOwnerDockTasks: (...args: unknown[]) => mockListOwnerDockTasks(...args),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

async function callGET(url: string) {
  const { GET } = await import('@/app/api/recgon/owner/dock/route');
  return GET(new Request(url));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockListOwnerDockTasks.mockResolvedValue({ triaged: [], deferred: [] });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/recgon/owner/dock — auth + role', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(401);
    expect(mockListOwnerDockTasks).not.toHaveBeenCalled();
  });

  it('rejects member role with 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-member' } });
    mockVerifyTeamAccess.mockResolvedValue('member');
    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(403);
    expect(mockListOwnerDockTasks).not.toHaveBeenCalled();
  });

  it('rejects viewer role with 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-viewer' } });
    mockVerifyTeamAccess.mockResolvedValue('viewer');
    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(403);
    expect(mockListOwnerDockTasks).not.toHaveBeenCalled();
  });

  it('rejects users with no role on the target team with 403', async () => {
    // User is owner of a different team. verifyTeamAccess for THIS team returns null.
    mockAuth.mockResolvedValue({ user: { id: 'user-x' } });
    mockVerifyTeamAccess.mockResolvedValue(null);
    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(403);
    expect(mockListOwnerDockTasks).not.toHaveBeenCalled();
  });
});

describe('GET /api/recgon/owner/dock — validation', () => {
  it('rejects missing teamId query param with 400', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    const res = await callGET('http://localhost/api/recgon/owner/dock');
    expect(res.status).toBe(400);
    expect(mockVerifyTeamAccess).not.toHaveBeenCalled();
  });

  it('treats verifyTeamAccess null (team missing / not a member) as 403', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    mockVerifyTeamAccess.mockResolvedValue(null);
    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=ghost-team');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/recgon/owner/dock — success', () => {
  it('returns {triaged:[], deferred:[]} for an empty owner team', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockListOwnerDockTasks.mockResolvedValue({ triaged: [], deferred: [] });

    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ triaged: [], deferred: [] });
    expect(mockListOwnerDockTasks).toHaveBeenCalledWith('team-1');
  });

  it('returns triaged + deferred separately and excludes normal assigned tasks', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
    mockVerifyTeamAccess.mockResolvedValue('owner');
    // The storage helper is responsible for filtering — the route just returns
    // whatever it gets. So we mock the helper to return only triaged + deferred,
    // and assert the route does NOT mutate that shape (no normal assigned bleed-through).
    mockListOwnerDockTasks.mockResolvedValue({
      triaged: [triagedTask],
      deferred: [deferredTask],
    });

    const res = await callGET('http://localhost/api/recgon/owner/dock?teamId=team-1');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.triaged).toHaveLength(1);
    expect(body.triaged[0].id).toBe('task-triaged');
    expect(body.deferred).toHaveLength(1);
    expect(body.deferred[0].id).toBe('task-deferred');
    // Normal assigned tasks are not in the helper's response → not in body.
    const allIds = [...body.triaged, ...body.deferred].map((t: { id: string }) => t.id);
    expect(allIds).not.toContain(assignedTask.id);
  });
});
