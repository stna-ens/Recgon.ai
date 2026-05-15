// Phase 3.5 / Plan 03.5-02 — CapacityBar utilization-band contract.
//
// Locks UI-SPEC §6 boundaries: <60 healthy, 60-85 warn, 86-100 near-cap,
// >100 overloaded, 0 idle. ARIA per UI-SPEC §9.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CapacityBar } from '@/components/v2/projects/owner/CapacityBar';
import { aliceTeammate, fixtureTeammate } from './ownerBoard/setup';

// Capacity for aliceTeammate fixture = 30h.
const tm = aliceTeammate;

describe('CapacityBar — utilization-band contract (UI-SPEC §6)', () => {
  it('healthy (<60%): renders is-healthy class + "HEALTHY" copy', () => {
    const { container, getByText } = render(
      <CapacityBar
        teammate={tm}
        scheduledHoursThisWeek={12}
        weekIndex={1}
        weekStartLabel="MAY 18"
      />,
    );
    const bar = container.querySelector('.capacity-bar');
    expect(bar).toBeTruthy();
    expect(bar?.className).toContain('is-healthy');
    expect(getByText(/HEALTHY/)).toBeTruthy();
    expect(getByText(/12h \/ 30h/)).toBeTruthy();
  });

  it('approaching (60-85%): is-warn class + "APPROACHING"', () => {
    const { container, getByText } = render(
      <CapacityBar
        teammate={tm}
        scheduledHoursThisWeek={21}
        weekIndex={1}
        weekStartLabel="MAY 18"
      />,
    );
    const bar = container.querySelector('.capacity-bar');
    expect(bar?.className).toContain('is-warn');
    expect(getByText(/APPROACHING/)).toBeTruthy();
    expect(getByText(/21h \/ 30h/)).toBeTruthy();
  });

  it('near cap (86-100%): is-near-cap + "NEAR CAP"', () => {
    const { container, getByText } = render(
      <CapacityBar
        teammate={tm}
        scheduledHoursThisWeek={27}
        weekIndex={1}
        weekStartLabel="MAY 18"
      />,
    );
    const bar = container.querySelector('.capacity-bar');
    expect(bar?.className).toContain('is-near-cap');
    expect(getByText(/NEAR CAP/)).toBeTruthy();
    expect(getByText(/27h \/ 30h/)).toBeTruthy();
  });

  it('overloaded (>100%): is-overloaded + "OVER"', () => {
    const { container, getByText } = render(
      <CapacityBar
        teammate={tm}
        scheduledHoursThisWeek={33}
        weekIndex={1}
        weekStartLabel="MAY 18"
      />,
    );
    const bar = container.querySelector('.capacity-bar');
    expect(bar?.className).toContain('is-overloaded');
    expect(getByText(/OVER/)).toBeTruthy();
    expect(getByText(/33h \/ 30h/)).toBeTruthy();
  });

  it('idle (0h scheduled): empty fill + "IDLE" copy', () => {
    const { container, getByText } = render(
      <CapacityBar
        teammate={tm}
        scheduledHoursThisWeek={0}
        weekIndex={1}
        weekStartLabel="MAY 18"
      />,
    );
    expect(getByText(/IDLE/)).toBeTruthy();
    const fill = container.querySelector('.capacity-bar-fill') as HTMLElement | null;
    expect(fill).toBeTruthy();
    // 0% width fill — empty bar.
    expect(fill?.style.width === '0%' || fill?.style.width === '' || fill?.style.width === '0px').toBe(true);
  });

  it('a11y: role=progressbar with valuemin/valuemax/valuenow/aria-label', () => {
    const teammate = fixtureTeammate({ id: 'tm-x', displayName: 'rosa', capacityHours: 40 });
    const { container } = render(
      <CapacityBar
        teammate={teammate}
        scheduledHoursThisWeek={20}
        weekIndex={2}
        weekStartLabel="MAY 25"
      />,
    );
    const bar = container.querySelector('.capacity-bar') as HTMLElement | null;
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('40');
    expect(bar?.getAttribute('aria-valuenow')).toBe('20');
    expect(bar?.getAttribute('aria-label')).toMatch(/rosa/);
    expect(bar?.getAttribute('aria-label')).toMatch(/week 2/i);
  });
});
