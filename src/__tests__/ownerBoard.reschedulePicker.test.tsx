// Phase 3.5 / Plan 03.5-03 — ReschedulePicker render + apply contract.
//
// Tests for the dumb popover component itself (Tests 7, 9, 10 from PLAN).
// The integration into chip context menu + body-shape assertion are in
// ownerBoard.reschedulePickerIntegration.test.tsx (alongside the board
// wiring tests in Task 3 wave). For Task 2 we lock the picker's own contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReschedulePicker } from '@/components/v2/projects/owner/ReschedulePicker';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReschedulePicker — open/close + apply', () => {
  it('Test 7: opens with the input pre-populated to currentDate; apply calls onReschedule with new date', async () => {
    const onReschedule = vi.fn(async () => undefined);
    const onOpenChange = vi.fn();

    render(
      <ReschedulePicker
        open
        onOpenChange={onOpenChange}
        currentDate="2026-05-17"
        trigger={<button>open</button>}
        onReschedule={onReschedule}
      />,
    );

    const input = await screen.findByTestId('reschedule-picker-input') as HTMLInputElement;
    expect(input.value).toBe('2026-05-17');

    fireEvent.change(input, { target: { value: '2026-05-25' } });
    expect(input.value).toBe('2026-05-25');

    fireEvent.click(screen.getByTestId('reschedule-picker-apply'));

    // The handler is async; await microtask.
    await new Promise((r) => setTimeout(r, 0));
    expect(onReschedule).toHaveBeenCalledWith('2026-05-25');
  });

  it('Test 7b: cancel button closes the popover without calling onReschedule', async () => {
    const onReschedule = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ReschedulePicker
        open
        onOpenChange={onOpenChange}
        currentDate="2026-05-17"
        trigger={<button>open</button>}
        onReschedule={onReschedule}
      />,
    );

    const cancelBtn = await screen.findByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onReschedule).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Test 7c: null currentDate defaults to today', async () => {
    const onReschedule = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ReschedulePicker
        open
        onOpenChange={onOpenChange}
        currentDate={null}
        trigger={<button>open</button>}
        onReschedule={onReschedule}
      />,
    );

    const input = await screen.findByTestId('reschedule-picker-input') as HTMLInputElement;
    const todayISO = new Date().toISOString().slice(0, 10);
    expect(input.value).toBe(todayISO);
  });
});
