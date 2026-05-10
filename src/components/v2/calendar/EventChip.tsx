'use client';

import { useRef, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { CalendarCard } from './calendarTypes';
import type { TeammateWithStats } from '@/lib/recgon/types';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';
import { stripMd } from '@/lib/strings';

const STATUS_COLOR: Record<string, string> = {
  completed:       'var(--success)',
  done:            'var(--success)',
  verified:        'var(--success)',
  awaiting_review: 'var(--warning)',
  in_progress:     'var(--signature)',
  accepted:        'var(--signature)',
  assigned:        'var(--txt-muted)',
  unassigned:      'var(--txt-faint)',
};

type Props = {
  card: CalendarCard;
  teammate?: TeammateWithStats;
  onClick: (card: CalendarCard) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>, card: CalendarCard) => void;
  onDragEnd?: () => void;
  resizable?: boolean;
  onResizeStart?: (e: ReactMouseEvent<HTMLSpanElement>, card: CalendarCard) => void;
  // Optional team chip rendered below the title row. Used by the personal
  // calendar so a card can show which team it came from when the lane no
  // longer carries that signal.
  teamBadge?: { name: string; color: string | null } | null;
};

export function EventChip({
  card,
  teammate,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
  resizable = false,
  onResizeStart,
  teamBadge,
}: Props) {
  const accentColor = STATUS_COLOR[card.task.status] ?? 'var(--signature)';
  const cleanTitle = stripMd(card.title);
  const hasRescheduleRequest = card.task.rescheduleRequestStatus === 'pending';
  const hours = card.estimatedHours;
  const hoursLabel = `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;

  // Track whether the mousedown that started this interaction landed on the
  // resize handle. If so, suppress the chip's HTML5 drag — otherwise the
  // browser begins a drag operation before our resize listener can intercept.
  const resizingRef = useRef(false);

  const handleResizeMouseDown = (e: ReactMouseEvent<HTMLSpanElement>) => {
    resizingRef.current = true;
    e.stopPropagation();
    e.preventDefault();
    const cleanup = () => {
      // Defer to next tick so onDragStart (if any was queued) sees the flag.
      setTimeout(() => { resizingRef.current = false; }, 0);
      window.removeEventListener('mouseup', cleanup);
    };
    window.addEventListener('mouseup', cleanup);
    onResizeStart?.(e, card);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (resizingRef.current) {
      e.preventDefault();
      return;
    }
    onDragStart?.(e, card);
  };

  return (
    <div
      className={`cal-chip${card.isMultiDay ? ' cal-chip-multi' : ''}${draggable ? ' is-draggable' : ''}${hasRescheduleRequest ? ' has-request' : ''}`}
      style={{ '--accent': accentColor } as React.CSSProperties}
      onClick={() => onClick(card)}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(card);
        }
      }}
      title={cleanTitle}
    >
      <span className="cal-chip-accent" />
      <div className="cal-chip-row">
        {teammate && (
          <TeammateAvatar
            name={teammate.displayName}
            avatarUrl={teammate.avatarUrl}
            avatarColor={teammate.avatarColor}
            size={16}
          />
        )}
        <span className="cal-chip-title">{cleanTitle}</span>
        <span className="cal-chip-hours">{hoursLabel}</span>
      </div>
      {teamBadge && (
        <span
          className="cal-chip-team"
          style={{ '--team-color': teamBadge.color ?? 'var(--signature)' } as React.CSSProperties}
        >
          <span className="cal-chip-team-dot" aria-hidden="true" />
          <span className="cal-chip-team-name">{teamBadge.name}</span>
        </span>
      )}
      {hasRescheduleRequest && <span className="cal-chip-request">move</span>}
      {resizable && (
        <span
          className="cal-chip-resize"
          aria-label="Resize task"
          onMouseDown={handleResizeMouseDown}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <style>{css}</style>
    </div>
  );
}

const css = `
.cal-chip {
  position: relative;
  border-radius: 4px;
  background: var(--cal-chip-bg, #111114);
  border: 1px solid var(--rule);
  overflow: hidden;
  cursor: pointer;
  padding: 6px 12px 6px 14px;
  box-sizing: border-box;
  transition: transform 140ms cubic-bezier(0.16,1,0.3,1), border-color 140ms ease;
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  outline: none;
}
.cal-chip.is-draggable { cursor: grab; }
.cal-chip.is-draggable:active { cursor: grabbing; }
.cal-chip:hover {
  transform: translateY(-1px);
  border-color: var(--rule-strong);
}
.cal-chip.has-request { border-color: rgba(var(--signature-rgb), 0.26); }
.cal-chip:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
}
.cal-chip-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent);
  pointer-events: none;
}
.cal-chip-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.cal-chip-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--txt-pure);
  letter-spacing: 0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
}
.cal-chip-hours {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--txt-faint);
  letter-spacing: 0.4px;
  flex-shrink: 0;
}
.cal-chip-request {
  align-self: flex-start;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--signature);
  border: 1px solid rgba(var(--signature-rgb), 0.28);
  padding: 1px 4px;
  line-height: 1.2;
}
.cal-chip-team {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--txt-faint);
  line-height: 1.2;
  max-width: 100%;
}
.cal-chip-team-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--team-color, var(--signature));
  flex-shrink: 0;
}
.cal-chip-team-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.cal-chip-multi .cal-chip-team {
  align-self: center;
  margin-left: auto;
}
.cal-chip-resize {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  background: transparent;
  z-index: 5;
  opacity: 0;
  transition: opacity 140ms ease, background 140ms ease;
}
.cal-chip:hover .cal-chip-resize { opacity: 1; }
.cal-chip-resize:hover {
  background: linear-gradient(90deg, transparent, rgba(var(--signature-rgb), 0.45));
}

/* Multi-day chips render as a single horizontal bar spanning the cells they
   occupy. SwimLane positions them via grid-column-end + width math; here we
   collapse internal layout so the title sits on one line. */
.cal-chip-multi {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 14px 0 14px;
}
.cal-chip-multi .cal-chip-row {
  height: 100%;
  align-items: center;
}
.cal-chip-multi .cal-chip-title {
  -webkit-line-clamp: 1;
  white-space: nowrap;
  display: block;
}
.cal-chip-multi .cal-chip-request {
  align-self: center;
  margin-left: auto;
}
`;
