// Phase 2 / SKILL-03 / SKILL-05 — Inferred-skills UI: per-pill confirm/reject.
//
// RED state (Plan 02-01): `<InferredFromGitHub />` component does not exist
// yet. Plan 02-03 creates `src/app/teams/[id]/me/InferredFromGitHub.tsx` and
// wires it into ProfilePreview's right rail.
//
// Spec (PLAN.md task 1 behavior):
//   - render <InferredFromGitHub items={[acceptedFixture, rejectedFixture]}
//     onReject onUndoReject />
//   - reject-button click fires `onReject(id)` AND optimistically flips the
//     pill to rejected DOM state.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Module-under-test — Plan 02-03 will create this.
import { InferredFromGitHub } from '@/app/teams/[id]/me/InferredFromGitHub';

import type { InferredSkill } from '@/lib/recgon/types';

const accepted: InferredSkill = {
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

const rejected: InferredSkill = {
  ...accepted,
  id: 'inf-2',
  canonicalTag: 'design',
  rejectedAt: '2026-05-02T00:00:00.000Z',
};

describe('<InferredFromGitHub /> (SKILL-03 / SKILL-05)', () => {
  it('fires onReject(id) when a reject-button is clicked and optimistically flips pill state', () => {
    const onReject = vi.fn();
    const onUndoReject = vi.fn();

    const { getByLabelText, container } = render(
      <InferredFromGitHub
        items={[accepted, rejected]}
        onReject={onReject}
        onUndoReject={onUndoReject}
      />,
    );

    // Aria label pattern from PATTERNS.md §ProfileForm.tsx "Reject inferred skill X".
    const btn = getByLabelText(/reject inferred skill frontend/i);
    fireEvent.click(btn);

    expect(onReject).toHaveBeenCalledWith('inf-1');

    // Optimistic flip: the pill DOM should now reflect rejected styling.
    // Plan 02-03 must set a class or data-attribute we can target here.
    const frontendPill = container.querySelector('[data-skill-id="inf-1"]');
    expect(frontendPill).toBeTruthy();
    expect(
      frontendPill?.getAttribute('data-rejected') === 'true' ||
        frontendPill?.classList.contains('preview-pill--rejected'),
    ).toBe(true);
  });
});
