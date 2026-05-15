// Phase 3.5 / Plan 03.5-01 — role-router contract for /projects.
//
// Locks the behavior that:
//   - owner → OwnerWorkloadBoard
//   - member or viewer → NonOwnerProjectsView (existing tiles)
//   - loading || no team → null
//   - members never fire owner-board API calls (Pitfall 3 hedge)
//
// Refactor risk: this is the route every user opens by default; a regression
// here either shows the wrong view to the wrong role or floods the network
// with /owner/dock calls from non-owners.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { mockUseTeam, type TeamRole } from './ownerBoard/setup';

// Track the role used by useTeam. Each test sets this before render.
let currentRole: TeamRole = 'owner';
let currentLoading = false;

vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => (currentLoading
    ? { ...mockUseTeam('owner'), currentTeam: null, loading: true }
    : mockUseTeam(currentRole)),
}));

// OwnerWorkloadBoard fetches /api/teams/.../teammates on mount. The router
// itself doesn't fire fetch, but Test 5 (member network check) needs the
// fetch spy installed BEFORE render — pre-install a no-op stub.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// Stub the OwnerWorkloadBoard module to avoid mounting its DndContext +
// network call in tests focused on the router branch. The branch test
// only needs to assert which child component is rendered.
vi.mock('@/app/projects/OwnerWorkloadBoard', () => ({
  OwnerWorkloadBoard: ({ teamId }: { teamId: string }) => (
    <div data-testid="stub-owner-board" data-team-id={teamId}>OWNER_BOARD_STUB</div>
  ),
}));

// Likewise stub NonOwnerProjectsView so the role-branch test doesn't depend
// on the tile-list's network shape (it fires /api/overview + /api/projects).
// Test 8 (shell regression test) imports the real one separately.
vi.mock('@/components/v2/projects/owner/NonOwnerProjectsView', () => ({
  default: () => <div data-testid="stub-non-owner-view">NON_OWNER_VIEW_STUB</div>,
}));

import V2ProjectsListPage from '@/app/projects/page';

describe('/projects role-router (Plan 03.5-01)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    currentLoading = false;
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ teammates: [] }) });
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('owner role → renders OwnerWorkloadBoard, not NonOwnerProjectsView', () => {
    currentRole = 'owner';
    render(<V2ProjectsListPage />);
    expect(screen.getByTestId('stub-owner-board')).toBeTruthy();
    expect(screen.queryByTestId('stub-non-owner-view')).toBeNull();
  });

  it('member role → renders NonOwnerProjectsView, not OwnerWorkloadBoard', () => {
    currentRole = 'member';
    render(<V2ProjectsListPage />);
    expect(screen.getByTestId('stub-non-owner-view')).toBeTruthy();
    expect(screen.queryByTestId('stub-owner-board')).toBeNull();
  });

  it('viewer role → renders NonOwnerProjectsView, not OwnerWorkloadBoard', () => {
    currentRole = 'viewer';
    render(<V2ProjectsListPage />);
    expect(screen.getByTestId('stub-non-owner-view')).toBeTruthy();
    expect(screen.queryByTestId('stub-owner-board')).toBeNull();
  });

  it('loading state → renders null (no flash of either view)', () => {
    currentLoading = true;
    const { container } = render(<V2ProjectsListPage />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('stub-owner-board')).toBeNull();
    expect(screen.queryByTestId('stub-non-owner-view')).toBeNull();
  });

  it('member role → never fires owner-board API calls (Pitfall 3 hedge)', async () => {
    currentRole = 'member';
    render(<V2ProjectsListPage />);

    // Wait for any micro-task fetches to settle.
    await waitFor(() => {
      // Nothing required to resolve; just give the event loop a tick.
      expect(true).toBe(true);
    });

    const ownerDockCalls = fetchSpy.mock.calls.filter((call) => {
      const url = call[0];
      return typeof url === 'string' && url.includes('/api/recgon/owner/dock');
    });
    expect(ownerDockCalls.length).toBe(0);
  });
});
