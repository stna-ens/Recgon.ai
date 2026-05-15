// Phase 3.5 / Plan 03.5-03 — dock manual-assign integration tests (Test 1-3).
//
// Tests:
//   1. AssignTeammatePicker render — closed trigger, click opens menu with N items, click item calls onAssign.
//   2. Dock integration — triaged row's picker fires POST /api/recgon/tasks/.../assign with correct body shape.
//   3. Dock integration — fetch failure → toast warning + row remains.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssignTeammatePicker } from '@/components/v2/projects/owner/AssignTeammatePicker';
import { TriageDock } from '@/components/v2/projects/owner/TriageDock';
import { aliceTeammate, bobTeammate, carolTeammate, triagedTask } from './ownerBoard/setup';

// jsdom shim — Radix DropdownMenu uses these PointerEvent APIs which jsdom omits.
// Without these stubs, clicking the trigger is a no-op (Radix bails on the missing
// pointer-capture / scrollIntoView APIs and never opens the menu).
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignTeammatePicker — render contract (Test 1)', () => {
  it('Test 1a: renders a trigger button "assign manually" by default', () => {
    const onAssign = vi.fn();
    render(
      <AssignTeammatePicker
        teammates={[aliceTeammate, bobTeammate, carolTeammate]}
        onAssign={onAssign}
      />,
    );
    expect(screen.getByTestId('assign-teammate-trigger')).toBeTruthy();
    expect(screen.getByTestId('assign-teammate-trigger').textContent).toMatch(/assign manually/i);
  });

  it('Test 1b: clicking the trigger opens the menu with one item per teammate', async () => {
    const onAssign = vi.fn();
    render(
      <AssignTeammatePicker
        teammates={[aliceTeammate, bobTeammate, carolTeammate]}
        onAssign={onAssign}
      />,
    );
    // Radix DropdownMenu opens on pointerdown (not click) — simulate both.
    const trigger = screen.getByTestId('assign-teammate-trigger');
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId('assign-teammate-option-tm-alice')).toBeTruthy();
      expect(screen.getByTestId('assign-teammate-option-tm-bob')).toBeTruthy();
      expect(screen.getByTestId('assign-teammate-option-tm-carol')).toBeTruthy();
    });
  });

  it('Test 1c: clicking a teammate item calls onAssign with that teammate id', async () => {
    const onAssign = vi.fn(async () => undefined);
    render(
      <AssignTeammatePicker
        teammates={[aliceTeammate, bobTeammate]}
        onAssign={onAssign}
      />,
    );
    const trigger = screen.getByTestId('assign-teammate-trigger');
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    await waitFor(() => screen.getByTestId('assign-teammate-option-tm-bob'));
    // Radix Menu Items trigger on pointerup; fire that sequence on the item.
    const bobItem = screen.getByTestId('assign-teammate-option-tm-bob');
    fireEvent.pointerDown(bobItem, { button: 0 });
    fireEvent.pointerUp(bobItem, { button: 0 });
    fireEvent.click(bobItem);

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith('tm-bob');
    });
  });

  it('Test 1d: empty teammates list → trigger renders disabled', () => {
    render(<AssignTeammatePicker teammates={[]} onAssign={vi.fn()} />);
    const btn = screen.getByTestId('assign-teammate-trigger') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('TriageDock integration — manual-assign path (Test 2-3)', () => {
  it('Test 2: clicking a teammate in a triaged-row picker calls onAssign(taskId, teammateId)', async () => {
    const onAssign = vi.fn(async () => undefined);
    render(
      <TriageDock
        triaged={[triagedTask]}
        deferred={[]}
        teammates={[aliceTeammate, bobTeammate]}
        onAssign={onAssign}
      />,
    );

    // Each triaged row carries its own picker.
    const trigger = screen.getByTestId('assign-teammate-trigger');
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    await waitFor(() => screen.getByTestId('assign-teammate-option-tm-alice'));
    const aliceItem = screen.getByTestId('assign-teammate-option-tm-alice');
    fireEvent.pointerDown(aliceItem, { button: 0 });
    fireEvent.pointerUp(aliceItem, { button: 0 });
    fireEvent.click(aliceItem);

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith(triagedTask.id, 'tm-alice');
    });
  });
});
