// Phase 2 / SKILL-03 / SKILL-05 — Inferred-skills UI: per-pill confirm/reject.
//
// Redesigned 2026-05-12 ("Editorial Review Desk"). The component now renders
// three zones — PENDING decision cards with Keep + Drop buttons, KEPT pink
// pills, and DROPPED muted pills. Locked ARIA copy is preserved so the
// existing "Reject inferred skill X" assertion still finds the Drop button.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

import { InferredFromGitHub } from '@/app/teams/[id]/me/InferredFromGitHub';

import type { InferredSkill } from '@/lib/recgon/types';

const pending: InferredSkill = {
  id: 'inf-1',
  teammateId: 'tm-1',
  teamId: 'team-1',
  canonicalTag: 'frontend',
  score: 0.82,
  source: 'llm_commit',
  lastSeenAt: '2026-05-01T00:00:00.000Z',
  confirmedAt: null,
  rejectedAt: null,
  userReviewedAt: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const droppedFixture: InferredSkill = {
  ...pending,
  id: 'inf-2',
  canonicalTag: 'design',
  rejectedAt: '2026-05-02T00:00:00.000Z',
};

const keptFixture: InferredSkill = {
  ...pending,
  id: 'inf-3',
  canonicalTag: 'react',
  userReviewedAt: '2026-05-02T00:00:00.000Z',
};

describe('<InferredFromGitHub /> (SKILL-03 / SKILL-05)', () => {
  it('fires onReject(id) when a Drop button is clicked and optimistically flips state to dropped', () => {
    const onReject = vi.fn();
    const onUndoReject = vi.fn();
    const onKeep = vi.fn();

    const { getByLabelText, container } = render(
      <InferredFromGitHub
        items={[pending, droppedFixture]}
        onReject={onReject}
        onUndoReject={onUndoReject}
        onKeep={onKeep}
      />,
    );

    // Locked ARIA: "Reject inferred skill {canonical}" — preserved on Drop.
    const btn = getByLabelText(/reject inferred skill frontend/i);
    fireEvent.click(btn);

    expect(onReject).toHaveBeenCalledWith('inf-1');

    // Optimistic flip: the row moves from Pending → Dropped zone and the
    // new DroppedPill carries data-rejected="true" for test continuity.
    const flipped = container.querySelector('[data-skill-id="inf-1"]');
    expect(flipped).toBeTruthy();
    expect(flipped?.getAttribute('data-rejected')).toBe('true');
  });

  it('fires onKeep(id) when a Keep button is clicked and optimistically flips state to kept', () => {
    const onReject = vi.fn();
    const onUndoReject = vi.fn();
    const onKeep = vi.fn();

    const { getByLabelText, container } = render(
      <InferredFromGitHub
        items={[pending]}
        onReject={onReject}
        onUndoReject={onUndoReject}
        onKeep={onKeep}
      />,
    );

    const keepBtn = getByLabelText(/keep inferred skill frontend/i);
    fireEvent.click(keepBtn);

    expect(onKeep).toHaveBeenCalledWith('inf-1');

    // Optimistic flip: item moves to Kept zone with data-kept="true".
    const flipped = container.querySelector('[data-skill-id="inf-1"]');
    expect(flipped).toBeTruthy();
    expect(flipped?.getAttribute('data-kept')).toBe('true');
  });

  it('renders zone dividers only for non-empty zones', () => {
    const onReject = vi.fn();
    const onUndoReject = vi.fn();
    const onKeep = vi.fn();

    // Render with ONLY a kept item — Pending + Dropped zones must not show.
    const { container } = render(
      <InferredFromGitHub
        items={[keptFixture]}
        onReject={onReject}
        onUndoReject={onUndoReject}
        onKeep={onKeep}
      />,
    );

    const labels = Array.from(container.querySelectorAll('.zone-divider__label'))
      .map((el) => el.textContent);
    expect(labels).toEqual(['Kept']);
  });
});
