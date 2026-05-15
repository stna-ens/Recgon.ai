// Phase 3.5 / Plan 03.5-02 + 03 — single row inside the owner-board Triage Dock.
//
// Three-line stack per UI-SPEC §6 / §7:
//   1. Title (mono 11px, ellipsized).
//   2. Reason copy (system-stack, 12px, italic, --txt-muted).
//      Mapping per D-14:
//        no_clear_fit              → "no clear fit"
//        no_grounded_reason        → "no grounded reason"
//        no_capacity_in_window     → "qualified but booked through 4 wks"
//        no_capacity_high_priority → "high-priority + no capacity now"
//        deferred                  → "deferred → MMM D" (uppercase MMM)
//   3. Action row: <AssignTeammatePicker> for triaged rows; deferred rows
//      additionally expose a "×" dismiss slot. Plan 03.5-03 wires both.

'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import { AssignTeammatePicker } from './AssignTeammatePicker';

type Props = {
  task: AgentTask;
  isDeferred: boolean;
  teammates: TeammateWithStats[];
  onAssign?: (taskId: string, teammateId: string) => Promise<void> | void;
  onDismiss?: (taskId: string) => Promise<void> | void;
};

function reasonCopy(task: AgentTask, isDeferred: boolean): string {
  if (isDeferred) {
    if (task.scheduledDate) {
      // YYYY-MM-DD → MMM D (uppercase month).
      const d = new Date(`${task.scheduledDate}T00:00:00`);
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const day = d.getDate();
      return `deferred → ${month} ${day}`;
    }
    return 'deferred';
  }
  switch (task.triageNote) {
    case 'no_clear_fit':
      return 'no clear fit';
    case 'no_grounded_reason':
      return 'no grounded reason';
    case 'no_capacity_in_window':
      return 'qualified but booked through 4 wks';
    case 'no_capacity_high_priority':
      return 'high-priority + no capacity now';
    default:
      return '';
  }
}

export function TriageDockRow({ task, isDeferred, teammates, onAssign, onDismiss }: Props) {
  const reason = reasonCopy(task, isDeferred);

  // Plan 03.5-03 — dock rows are dnd-kit drag sources with kind='dock-row'.
  // Dropping a dock row onto a cell fires BOTH assign + schedule in one op.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { kind: 'dock-row' },
  });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none',
  };

  return (
    <li
      ref={setNodeRef}
      className="triage-row"
      role="listitem"
      data-testid={`triage-row-${task.id}`}
      style={dragStyle}
    >
      <div className="triage-row-title-line">
        <span
          className="triage-row-grip"
          {...attributes}
          {...listeners}
          aria-label={`drag ${task.title}`}
          data-testid={`triage-row-grip-${task.id}`}
        >
          ⋮⋮
        </span>
        <span className="triage-row-title" title={task.title}>{task.title}</span>
        {isDeferred && (
          <button
            type="button"
            className="triage-row-dismiss"
            data-testid={`triage-row-dismiss-${task.id}`}
            aria-label={`dismiss ${task.title} from dock`}
            title="Dismiss from dock — task stays in calendar"
            onClick={() => onDismiss?.(task.id)}
          >
            ×
          </button>
        )}
      </div>
      <span className="triage-row-reason">{reason}</span>
      <div className="triage-row-actions">
        <AssignTeammatePicker
          teammates={teammates}
          onAssign={async (teammateId) => {
            await onAssign?.(task.id, teammateId);
          }}
          triggerLabel="assign manually"
          ariaLabel={`assign ${task.title}`}
        />
      </div>
      <style>{css}</style>
    </li>
  );
}

const css = `
.triage-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  list-style: none;
}
.triage-row-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.triage-row-grip {
  color: var(--txt-faint);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: -1.5px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  padding: 0 2px;
  line-height: 1;
}
.triage-row-grip:active { cursor: grabbing; }
.triage-row-grip:hover { color: var(--signature); }
.triage-row-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-pure);
  letter-spacing: 0.4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.triage-row-reason {
  font-size: 12px;
  font-style: italic;
  color: var(--txt-muted);
  line-height: 1.3;
}
.triage-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.triage-row-action {
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--txt-muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease;
  line-height: 1;
}
.triage-row-action:hover {
  color: var(--signature);
  border-color: var(--signature);
}
.triage-row-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.triage-row-dismiss {
  background: transparent;
  border: none;
  color: var(--txt-faint);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  transition: color 160ms ease;
  flex-shrink: 0;
}
.triage-row-dismiss:hover {
  color: var(--signature);
}
`;
