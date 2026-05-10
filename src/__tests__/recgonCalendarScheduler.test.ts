import { describe, expect, it } from 'vitest';
import { planTaskSchedule } from '../lib/recgon/scheduler';
import type { WorkingHours } from '../lib/recgon/types';

const weekdayHours: WorkingHours = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
};

const teammate = {
  capacityHours: 10, // 2h/day across 5 working days
  workingHours: weekdayHours,
};

// 2026-05-04 is a Monday in UTC.
describe('planTaskSchedule', () => {
  it('skips a day that already has its capacity assigned', () => {
    const plan = planTaskSchedule({
      teammate,
      task: {
        title: 'Prepare launch copy',
        estimatedHours: 1,
        deadline: null,
        priority: 2,
      },
      // Monday already has 2h reserved (= the daily budget).
      loadByDate: { '2026-05-04': 2 },
      now: new Date('2026-05-04T00:00:00.000Z'),
    });

    expect(plan).not.toBeNull();
    expect(plan!.scheduledDate).toBe('2026-05-05');
  });

  it('skips weekends to land on the next working day', () => {
    const plan = planTaskSchedule({
      teammate,
      task: {
        title: 'Plan next sprint',
        estimatedHours: 1,
        deadline: null,
        priority: 2,
      },
      now: new Date('2026-05-09T00:00:00.000Z'), // Saturday
    });

    expect(plan).not.toBeNull();
    expect(plan!.scheduledDate).toBe('2026-05-11'); // Monday
  });

  it('respects a hard deadline by returning null when nothing fits before it', () => {
    const plan = planTaskSchedule({
      teammate,
      task: {
        title: 'Ship today',
        estimatedHours: 1,
        deadline: '2026-05-09T12:00:00.000Z', // Saturday — no working day before in horizon
        priority: 2,
      },
      now: new Date('2026-05-09T13:00:00.000Z'),
    });

    expect(plan).toBeNull();
  });

  it('overflows above daily capacity as a last-resort fallback when capacity is full', () => {
    const plan = planTaskSchedule({
      teammate,
      task: {
        title: 'Urgent fix',
        estimatedHours: 4, // larger than the 2h daily budget
        deadline: null,
        priority: 2,
      },
      now: new Date('2026-05-04T00:00:00.000Z'),
    });

    // No day has 4h free, so it places on Monday with an "above capacity" note.
    expect(plan).not.toBeNull();
    expect(plan!.scheduledDate).toBe('2026-05-04');
    expect(plan!.scheduleNote).toMatch(/above teammate's daily capacity/);
  });
});
