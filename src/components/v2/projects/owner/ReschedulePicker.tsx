// Phase 3.5 / Plan 03.5-03 — owner-only chip reschedule picker.
//
// Radix Popover wrapping an <input type="date"> + apply/cancel buttons.
// The picker is dumb: it owns the date-input state but the parent owns the
// open/close state and the actual fetch. This lets the parent coordinate
// optimistic UI + rollback consistently with drag-drop reschedule paths.
//
// The picker is rendered IN the parent (OwnerWorkloadBoard) and conditionally
// passed an open=true when the owner picks "reschedule" from a chip's overflow
// menu. For Wave 3 the trigger is exposed on the TaskDetailPanel via an
// additional action button (cleanest surface — no chip-hover kebab to design).

'use client';

import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-populate the date input. ISO YYYY-MM-DD; pass null to use today. */
  currentDate: string | null;
  /** Anchor for the popover — a Radix Popover.Trigger or any focusable element. */
  trigger: React.ReactNode;
  onReschedule: (newDateISO: string) => Promise<void> | void;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReschedulePicker({
  open,
  onOpenChange,
  currentDate,
  trigger,
  onReschedule,
}: Props) {
  const [date, setDate] = useState<string>(currentDate ?? todayISO());
  const [submitting, setSubmitting] = useState(false);

  // Reset internal state when the popover opens with a new task.
  useEffect(() => {
    if (open) {
      setDate(currentDate ?? todayISO());
      setSubmitting(false);
    }
  }, [open, currentDate]);

  const handleApply = async () => {
    if (submitting) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setSubmitting(true);
    try {
      await onReschedule(date);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="reschedule-picker-content"
          sideOffset={8}
          align="start"
          data-testid="reschedule-picker"
        >
          <div className="reschedule-picker-row">
            <label className="reschedule-picker-label" htmlFor="reschedule-date-input">
              new date
            </label>
            <input
              id="reschedule-date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="reschedule-picker-input"
              data-testid="reschedule-picker-input"
            />
          </div>
          <div className="reschedule-picker-actions">
            <button
              type="button"
              className="reschedule-picker-cancel"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              cancel
            </button>
            <button
              type="button"
              className="reschedule-picker-apply"
              onClick={handleApply}
              disabled={submitting || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
              data-testid="reschedule-picker-apply"
            >
              {submitting ? 'working' : 'apply'}
            </button>
          </div>
          <style>{css}</style>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const css = `
.reschedule-picker-content {
  min-width: 240px;
  padding: 14px;
  background: var(--glass-substrate);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid var(--btn-secondary-border);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-deep);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: reschedulePickerOpen 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes reschedulePickerOpen {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.reschedule-picker-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reschedule-picker-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.0px;
  text-transform: uppercase;
  color: var(--txt-faint);
}
.reschedule-picker-input {
  padding: 8px 10px;
  background: var(--bg-deep);
  border: 1px solid var(--btn-secondary-border);
  border-radius: var(--r-sm);
  color: var(--txt-pure);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 160ms ease;
}
.reschedule-picker-input:focus {
  border-color: rgba(var(--signature-rgb), 0.45);
  box-shadow: 0 0 0 2px rgba(var(--signature-rgb), 0.12);
}
.reschedule-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.reschedule-picker-cancel,
.reschedule-picker-apply {
  padding: 7px 12px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.0px;
  text-transform: uppercase;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: opacity 120ms ease;
  border: 1px solid var(--btn-secondary-border);
}
.reschedule-picker-cancel {
  background: var(--btn-secondary-bg);
  color: var(--txt-muted);
}
.reschedule-picker-apply {
  background: var(--signature);
  color: white;
  border-color: transparent;
}
.reschedule-picker-cancel:hover:not(:disabled),
.reschedule-picker-apply:hover:not(:disabled) {
  opacity: 0.88;
}
.reschedule-picker-cancel:disabled,
.reschedule-picker-apply:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
`;
