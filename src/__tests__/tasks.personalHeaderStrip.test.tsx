// Phase 3.5 / Plan 03.5-04 — /tasks personal header strip.
//
// Contract:
//   - Owner sees: PERSONAL TASKS eyebrow + sentence + signature-pink /projects link.
//   - Non-owner sees: PERSONAL TASKS eyebrow + sentence WITHOUT /projects link.
//   - Loading state (currentTeam null) hides strip entirely.
//   - Existing kanban columns (assigned / in progress / in review) still render.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = (() => false) as Element['hasPointerCapture'];
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = (() => {}) as Element['setPointerCapture'];
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = (() => {}) as Element['releasePointerCapture'];
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = (() => {}) as Element['scrollIntoView'];
  }
}

// jsdom shim — ResizeObserver is used by the v2-tasks page light-tracking
// effect. jsdom omits it; without this stub, mounting V2TasksInner throws.
if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// Same shim for IntersectionObserver, which v2-tasks may also touch.
if (typeof globalThis !== 'undefined' && !('IntersectionObserver' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// Per-test useTeam mock. We swap the implementation per case via vi.doMock
// so the same module can be imported with a different role each time.
const teamMock = vi.hoisted(() => ({
  currentRole: 'owner' as 'owner' | 'member' | null,
}));

vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => {
    if (teamMock.currentRole === null) {
      return {
        currentTeam: null,
        teams: [],
        loading: true,
        projects: [],
        projectUpdateStatuses: {},
        refreshProjects: vi.fn(),
        setCurrentTeam: vi.fn(),
        refreshTeams: vi.fn().mockResolvedValue(undefined),
        setProjectUpdateStatuses: vi.fn(),
      };
    }
    return {
      currentTeam: {
        id: 'team-1',
        name: 'Test Team',
        role: teamMock.currentRole,
        slug: 'test-team',
        createdBy: 'user-owner',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      teams: [],
      loading: false,
      projects: [],
      projectUpdateStatuses: {},
      refreshProjects: vi.fn(),
      setCurrentTeam: vi.fn(),
      refreshTeams: vi.fn().mockResolvedValue(undefined),
      setProjectUpdateStatuses: vi.fn(),
    };
  },
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// Mock /api/inbox so the kanban renders with three columns + empty bodies.
beforeEach(() => {
  cleanup();
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
    const u = typeof url === 'string' ? url : '';
    if (u.includes('/api/inbox')) {
      return { ok: true, status: 200, json: async () => ({ tasks: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'unmocked' }) };
  }));
});

import V2TasksPage from '@/app/tasks/page';

describe('/tasks personal header strip (Plan 03.5-04 Task 3)', () => {
  it('owner: renders eyebrow PERSONAL TASKS + signature-pink /projects link', async () => {
    teamMock.currentRole = 'owner';
    render(<V2TasksPage />);

    // Eyebrow rendered.
    expect(await screen.findByText(/PERSONAL TASKS/)).toBeTruthy();

    // /projects link present (next/link → <a>).
    const link = screen.getByRole('link', { name: /\/projects/ });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/projects');

    // Regression guard — kanban columns still render below the strip.
    expect(screen.getByText(/^assigned$/i)).toBeTruthy();
    expect(screen.getByText(/^in progress$/i)).toBeTruthy();
    expect(screen.getByText(/^in review$/i)).toBeTruthy();
  });

  it('non-owner (member): renders eyebrow + sentence WITHOUT /projects link', async () => {
    teamMock.currentRole = 'member';
    render(<V2TasksPage />);

    expect(await screen.findByText(/PERSONAL TASKS/)).toBeTruthy();

    // /projects link is absent for non-owners.
    expect(screen.queryByRole('link', { name: /\/projects/ })).toBeNull();

    // Kanban columns still render.
    expect(screen.getByText(/^assigned$/i)).toBeTruthy();
    expect(screen.getByText(/^in progress$/i)).toBeTruthy();
    expect(screen.getByText(/^in review$/i)).toBeTruthy();
  });

  it('loading state (currentTeam null): strip NOT rendered, but kanban shell renders', async () => {
    teamMock.currentRole = null;
    render(<V2TasksPage />);

    // The eyebrow is hidden during loading state to avoid flashing.
    expect(screen.queryByText(/PERSONAL TASKS/)).toBeNull();
  });
});
