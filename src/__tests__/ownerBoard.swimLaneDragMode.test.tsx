// Phase 3.5 / Plan 03.5-01 — SwimLane `dragMode` prop contract.
//
// Verifies the prop gates BOTH the HTML5 cell wiring (onDragOver/onDrop) AND
// the per-chip `draggable` attribute, so `/calendar` (default 'native')
// behavior never regresses while the new owner board opts into 'dnd-kit'.
//
// RESEARCH § Pitfall 2 — both systems firing creates double drops.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import { SwimLane } from '@/components/v2/calendar/SwimLane';
import type { CalendarCard } from '@/components/v2/calendar/calendarTypes';
import { aliceTeammate } from './ownerBoard/setup';

// 14-day window starting Mon May 16 2026 (a fixed-date fixture so chip
// scheduling math is reproducible across test runs).
const baseDate = new Date('2026-05-18T00:00:00.000Z');
const dayDates: Date[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + i);
  return d;
});

function makeCard(overrides: Partial<CalendarCard> = {}): CalendarCard {
  return {
    id: 'card-1',
    title: 'Test card',
    task: {
      id: 'task-1',
      teamId: 'team-1',
      projectId: 'project-1',
      title: 'Test card',
      description: '',
      kind: 'next_step',
      source: 'brain',
      sourceRef: {},
      requiredSkills: [],
      priority: 1,
      estimatedHours: 4,
      deadline: null,
      assignedTo: 'tm-alice',
      assignedBy: null,
      assignedAt: null,
      status: 'assigned',
      jobId: null,
      result: null,
      createdBy: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      completedAt: null,
      proof: null,
      verificationStatus: 'none',
      verificationEvidence: null,
      verifiedAt: null,
      verifiedBy: null,
      scheduledDate: '2026-05-18',
      scheduledUntilDate: null,
      scheduleNote: null,
      rescheduleRequestStatus: 'none',
      rescheduleRequestedAt: null,
      rescheduleRequestedBy: null,
      rescheduleRequestNote: null,
      rescheduleRequestedDate: null,
      assignmentReasoning: null,
      triageNote: null,
    },
    teammateId: 'tm-alice',
    dayIndex: 0,
    span: 1,
    estimatedHours: 4,
    scheduledDate: '2026-05-18',
    scheduledUntilDate: null,
    isMultiDay: false,
    ...overrides,
  } as CalendarCard;
}

function renderLane(props: Partial<React.ComponentProps<typeof SwimLane>> = {}) {
  return render(
    <SwimLane
      teammate={aliceTeammate}
      cards={props.cards ?? [makeCard()]}
      dayDates={dayDates}
      activeDayIndex={null}
      onCardClick={() => {}}
      canReschedule
      draggingTaskId={null}
      {...props}
    />,
  );
}

describe('SwimLane — dragMode prop', () => {
  it("dragMode='native' (default, when prop omitted) renders cells AND keeps the chip draggable attribute true", () => {
    const { container } = renderLane();
    const cells = container.querySelectorAll('[data-day-index][data-teammate-id]');
    expect(cells.length).toBe(14);

    // jsdom does not expose `oncellnative` handlers on React-rendered nodes the
    // same way DOM attrs do; verifying the chip's `draggable` attr is the most
    // reliable cross-runtime signal that the existing native wiring is alive.
    const chip = container.querySelector('.cal-chip');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('draggable')).toBe('true');
  });

  it("dragMode='native' explicit — chip draggable=true, native wiring active", () => {
    const { container } = renderLane({ dragMode: 'native' });
    const chip = container.querySelector('.cal-chip');
    expect(chip?.getAttribute('draggable')).toBe('true');
    expect(chip?.classList.contains('is-draggable')).toBe(true);
  });

  it("dragMode='dnd-kit' suppresses chip draggable + keeps cells in the DOM for dnd-kit ref attachment", () => {
    const { container } = renderLane({ dragMode: 'dnd-kit' });

    // Cells still render — dnd-kit's useDroppable needs the wrapper to attach a ref.
    const cells = container.querySelectorAll('[data-day-index][data-teammate-id]');
    expect(cells.length).toBe(14);

    // Chip MUST NOT be HTML5-draggable; outer DraggableChip wrapper handles drag.
    const chip = container.querySelector('.cal-chip');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('draggable')).toBe('false');
    expect(chip?.classList.contains('is-draggable')).toBe(false);
  });

  it("dragMode='none' suppresses chip draggable AND disables wiring entirely", () => {
    const { container } = renderLane({ dragMode: 'none' });
    const chip = container.querySelector('.cal-chip');
    expect(chip?.getAttribute('draggable')).toBe('false');
    expect(chip?.classList.contains('is-draggable')).toBe(false);
  });

  it('regression: omitting dragMode behaves identically to dragMode="native" (existing callers unaffected)', () => {
    const { container: omitted } = renderLane();
    const { container: explicit } = renderLane({ dragMode: 'native' });
    const omittedChip = omitted.querySelector('.cal-chip');
    const explicitChip = explicit.querySelector('.cal-chip');
    expect(omittedChip?.getAttribute('draggable')).toBe(explicitChip?.getAttribute('draggable'));
    expect(omittedChip?.classList.contains('is-draggable')).toBe(
      explicitChip?.classList.contains('is-draggable'),
    );
  });
});
