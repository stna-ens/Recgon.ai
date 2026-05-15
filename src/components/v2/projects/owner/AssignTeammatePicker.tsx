// Phase 3.5 / Plan 03.5-03 — owner-only manual-assign picker.
//
// Renders a Radix DropdownMenu listing the team's active teammates. Click a
// trigger ("assign manually" pill by default) → dropdown opens → click a
// teammate → `onAssign(teammateId)` is called. The picker handles its own
// open/close state + loading flag on the trigger while onAssign is pending.
//
// The actual fetch (/api/recgon/tasks/[id]/assign) lives in the parent
// component (OwnerWorkloadBoard.onAssignClick) so this picker stays
// dumb-component + reusable from any caller (dock row, future surfaces).
//
// Accessibility (UI-SPEC §6, RESEARCH § dnd-kit a11y carry-over):
//   - Trigger is a real <button> so keyboard focus / Enter / Space work.
//   - Each menu item has aria-label="assign to {name}" for screen readers.
//   - Esc closes the menu (Radix default).

'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TeammateWithStats } from '@/lib/recgon/types';

type Props = {
  teammates: TeammateWithStats[];
  onAssign: (teammateId: string) => Promise<void> | void;
  /** Label override for the trigger button. */
  triggerLabel?: string;
  /** Optional ARIA label override (default derives from triggerLabel). */
  ariaLabel?: string;
  /** Optional className override for the trigger (default 'triage-row-action'). */
  triggerClassName?: string;
};

export function AssignTeammatePicker({
  teammates,
  onAssign,
  triggerLabel = 'assign manually',
  ariaLabel,
  triggerClassName = 'triage-row-action',
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleSelect = async (teammateId: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onAssign(teammateId);
    } finally {
      setSubmitting(false);
    }
  };

  // No active teammates → still render the trigger but mark disabled so the
  // owner sees the surface and understands no one is available to assign to.
  const isEmpty = teammates.length === 0;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={ariaLabel ?? triggerLabel}
          disabled={submitting || isEmpty}
          data-testid="assign-teammate-trigger"
        >
          {submitting ? 'working' : triggerLabel}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="assign-picker-content"
          sideOffset={6}
          align="start"
          data-testid="assign-teammate-menu"
        >
          {teammates.map((tm) => (
            <DropdownMenu.Item
              key={tm.id}
              className="assign-picker-item"
              aria-label={`assign to ${tm.displayName}`}
              onSelect={() => handleSelect(tm.id)}
              data-testid={`assign-teammate-option-${tm.id}`}
            >
              <span className="assign-picker-name">{tm.displayName}</span>
              {tm.title && <span className="assign-picker-title">{tm.title}</span>}
            </DropdownMenu.Item>
          ))}
          <style>{css}</style>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const css = `
.assign-picker-content {
  min-width: 200px;
  padding: 6px;
  background: var(--glass-substrate);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid var(--btn-secondary-border);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-deep);
  z-index: 9999;
  animation: assignPickerOpen 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes assignPickerOpen {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.assign-picker-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  font-family: var(--font-inter), Inter, sans-serif;
  font-size: 13px;
  color: var(--txt-pure);
  outline: none;
  transition: background 120ms ease;
}
.assign-picker-item[data-highlighted],
.assign-picker-item:focus-visible {
  background: rgba(var(--signature-rgb), 0.08);
  color: var(--signature);
}
.assign-picker-name {
  font-weight: 600;
  letter-spacing: 0.2px;
}
.assign-picker-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--txt-faint);
}
`;
