// Phase 3.5 / Plan 03.5-01 — OwnerWorkloadBoard shell rendering.
//
// Locks the behavior that:
//   - empty render: PROJECTS eyebrow + Workload headline + date range
//   - populated grid: 14 day-header cells + one lane per teammate
//   - regression: NonOwnerProjectsView keeps its stable structural markers
//
// The DndContext is mounted at the grid root — verifiable by the
// data-testid="owner-board-grid" wrapper inside the context tree.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

import {
  aliceTeammate,
  bobTeammate,
  carolTeammate,
} from './ownerBoard/setup';

// Stub useTeam — we only need a current owner-team here. The board
// reads currentTeam.id to fetch teammates, but the OwnerWorkloadBoard
// prop `teamId` is what actually drives the fetch.
vi.mock('@/components/TeamProvider', () => ({
  useTeam: () => ({
    currentTeam: { id: 'team-1', name: 'Test Team', role: 'owner', slug: 'test', createdBy: 'u1', createdAt: '2026-01-01T00:00:00.000Z' },
    teams: [],
    loading: false,
    projects: null,
    projectUpdateStatuses: {},
    refreshProjects: vi.fn(),
    setCurrentTeam: vi.fn(),
    refreshTeams: vi.fn().mockResolvedValue(undefined),
    setProjectUpdateStatuses: vi.fn(),
  }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

import { OwnerWorkloadBoard } from '@/app/projects/OwnerWorkloadBoard';
import NonOwnerProjectsView from '@/components/v2/projects/owner/NonOwnerProjectsView';

describe('OwnerWorkloadBoard — shell render (Plan 03.5-01)', () => {
  beforeEach(() => {
    // Default: no teammates (empty board path).
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ teammates: [] }),
    });
    vi.stubGlobal('fetch', spy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the page chrome (PROJECTS eyebrow + Workload headline + date range)', async () => {
    const { container } = render(<OwnerWorkloadBoard teamId="team-1" />);

    // Page eyebrow — locked by recgon-label class + signature pink in UI-SPEC §4.
    const eyebrow = container.querySelector('.cal-nav-eyebrow');
    expect(eyebrow).toBeTruthy();
    expect(eyebrow?.textContent).toBe('PROJECTS');

    // Headline — "Workload" + arrow + date range; locked at the JetBrains Mono
    // 26px primary slot.
    const headline = container.querySelector('.cal-nav-headline-primary');
    expect(headline).toBeTruthy();
    expect(headline?.textContent).toMatch(/^Workload — /);
    expect(headline?.textContent).toMatch(/→/);

    // The board mounts before the teammate fetch resolves; verifying the
    // grid wrapper proves DndContext children are rendered.
    expect(container.querySelector('[data-testid="owner-workload-board"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="owner-board-grid"]')).toBeTruthy();
  });

  it('renders 14 day-header cells (per D-06)', async () => {
    const { container } = render(<OwnerWorkloadBoard teamId="team-1" />);
    const dayHeaders = container.querySelectorAll('.cal-day-header');
    expect(dayHeaders.length).toBe(14);
  });

  it('renders one SwimLane per active teammate when teammate list returns 3 teammates', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ teammates: [aliceTeammate, bobTeammate, carolTeammate] }),
    });
    vi.stubGlobal('fetch', spy);

    const { container } = render(<OwnerWorkloadBoard teamId="team-1" />);

    // Wait for the teammate fetch to settle and the lanes to render.
    await waitFor(() => {
      const lanes = container.querySelectorAll('.cal-lane-name');
      expect(lanes.length).toBe(3);
    });

    const laneNames = Array.from(container.querySelectorAll('.cal-lane-name')).map((el) => el.textContent);
    expect(laneNames).toEqual(['alice', 'bob', 'carol']);

    // Zero chips — Wave 1 passes empty cards array.
    expect(container.querySelectorAll('.cal-chip').length).toBe(0);

    // Grid still renders 14 day-header cells alongside the 3 teammate rows.
    expect(container.querySelectorAll('.cal-day-header').length).toBe(14);
  });
});

describe('NonOwnerProjectsView — regression (extracted verbatim from pre-refactor /projects)', () => {
  beforeEach(() => {
    // The component fires /api/overview + /api/projects per team. With teams=[]
    // it short-circuits to the empty state, which is enough to verify the
    // stable structural markers survived the extraction.
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', spy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves the page eyebrow + page-head + CTA structural markers', () => {
    const { container } = render(<NonOwnerProjectsView />);

    // Three stable structural markers carried over from pre-refactor:
    //   1. .v2-projects-page — root wrapper class
    //   2. .v2-page-head — header bar
    //   3. .v2-page-title — page-title element with the "$" prompt + "projects" text
    expect(container.querySelector('.v2-projects-page')).toBeTruthy();
    expect(container.querySelector('.v2-page-head')).toBeTruthy();
    const title = container.querySelector('.v2-page-title');
    expect(title).toBeTruthy();
    expect(title?.textContent).toContain('projects');
    expect(title?.querySelector('.v2-prompt')?.textContent).toBe('$');

    // CTAs preserved
    const ctaGroup = container.querySelector('.v2-page-cta-group');
    expect(ctaGroup).toBeTruthy();
    expect(ctaGroup?.textContent).toContain('import from github');
    expect(ctaGroup?.textContent).toContain('new project');
  });
});
