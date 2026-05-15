'use client';

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { EventChip } from './EventChip';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';
import type { CalendarCard } from './calendarTypes';
import type { TeammateWithStats } from '@/lib/recgon/types';
import { localDateKey } from './calendarUtils';

type Props = {
  teammate: TeammateWithStats;
  cards: CalendarCard[];
  dayDates: Date[];
  activeDayIndex: number | null;
  onCardClick: (card: CalendarCard) => void;
  laneIndex?: number;
  canReschedule?: boolean;
  draggingTaskId?: string | null;
  onTaskDrop?: (input: { taskId: string; teammateId: string; dayDate: Date }) => void;
  onTaskDragStart?: (e: DragEvent<HTMLDivElement>, card: CalendarCard) => void;
  onTaskDragEnd?: () => void;
  onTaskResize?: (input: { taskId: string; scheduledUntilDate: string | null }) => void;
  // Phase 3.5 (Plan 03.5-01): switch the drag-and-drop mechanism per RESEARCH § Pitfall 2.
  //   'native'  (default) keeps the current /calendar HTML5 wiring untouched.
  //   'dnd-kit' suppresses HTML5 listeners + draggable attribute so an outer
  //             <DndContext> can attach refs without double-firing.
  //   'none'    disables drag entirely.
  dragMode?: 'native' | 'dnd-kit' | 'none';
  // Phase 3.5 (Plan 03.5-02): optional node rendered INSIDE the lane-label
  // cell, BELOW the avatar/name row. The owner workload board uses this slot
  // for per-week capacity bars; the existing /calendar callers omit the prop
  // and get the prior layout byte-for-byte (default undefined).
  laneLabelExtra?: ReactNode;
};

const VISIBLE_CAP = 3;
const MULTI_CHIP_HEIGHT = 28;
const MULTI_ROW_GAP = 4;
const STACK_OFFSET = 8;
const SINGLE_GAP = 4;
const MIN_LANE_HEIGHT = 96;

function dailyCapacityHours(t: TeammateWithStats): number {
  const cap = Number(t.capacityHours) || 0;
  const days = t.workingHours?.days?.length ?? 7;
  return cap > 0 ? cap / Math.max(1, days) : 0;
}

// Greedy row assignment so overlapping multi-day chips don't visually collide.
function assignMultiRows(multi: CalendarCard[]): Map<string, number> {
  const sorted = [...multi].sort(
    (a, b) => a.dayIndex - b.dayIndex || (b.span - a.span),
  );
  const rowEnds: number[] = []; // last occupied dayIndex for each row
  const out = new Map<string, number>();
  for (const c of sorted) {
    let row = rowEnds.findIndex((end) => end < c.dayIndex);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(c.dayIndex + c.span - 1);
    } else {
      rowEnds[row] = c.dayIndex + c.span - 1;
    }
    out.set(c.id, row);
  }
  return out;
}

export function SwimLane({
  teammate,
  cards,
  dayDates,
  activeDayIndex,
  onCardClick,
  laneIndex = 0,
  canReschedule = false,
  draggingTaskId = null,
  onTaskDrop,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskResize,
  dragMode = 'native',
  laneLabelExtra,
}: Props) {
  // Phase 3.5: gate HTML5 wiring so it only fires in 'native' mode.
  // RESEARCH § Pitfall 2 — HTML5 + dnd-kit cannot both be active or drops fire twice.
  const useNativeDrag = dragMode === 'native';
  const chipDraggable = canReschedule && useNativeDrag;
  const [expandedCells, setExpandedCells] = useState<Set<number>>(new Set());
  const [dropDayIndex, setDropDayIndex] = useState<number | null>(null);
  const [resize, setResize] = useState<{
    card: CalendarCard;
    startDayIndex: number; // dayIndex of card start
    targetEndIndex: number; // currently-previewed end index within this lane
  } | null>(null);
  // Refs let mousemove read/write without triggering React renders for every
  // pixel of motion. We only setState when the cursor actually crosses a cell
  // boundary — that's the only thing that affects the visible layout.
  const lastEndIndexRef = useRef<number>(0);

  const handleResizeStart = (_e: ReactMouseEvent<HTMLSpanElement>, card: CalendarCard) => {
    if (!canReschedule || !onTaskResize) return;
    const startEnd = card.dayIndex + card.span - 1;
    lastEndIndexRef.current = startEnd;
    setResize({ card, startDayIndex: card.dayIndex, targetEndIndex: startEnd });
    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el?.closest('[data-day-index][data-teammate-id]') as HTMLElement | null;
      if (!cell) return;
      if (cell.dataset.teammateId !== teammate.id) return;
      const di = Number(cell.dataset.dayIndex);
      if (!Number.isFinite(di)) return;
      const clamped = Math.max(card.dayIndex, Math.min(6, di));
      if (clamped === lastEndIndexRef.current) return;
      lastEndIndexRef.current = clamped;
      setResize((prev) => prev ? { ...prev, targetEndIndex: clamped } : prev);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResize((current) => {
        if (current) {
          const newEndIndex = current.targetEndIndex;
          const endDate = dayDates[newEndIndex];
          if (endDate) {
            const newUntil = localDateKey(endDate);
            const collapseToSingleDay = newUntil <= card.scheduledDate;
            onTaskResize?.({
              taskId: card.task.id,
              scheduledUntilDate: collapseToSingleDay ? null : newUntil,
            });
          }
        }
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    // Safety: if the component unmounts mid-resize, listeners are cleaned up
    // by the closure, but reset visible state.
    return () => setResize(null);
  }, []);

  const isOdd = laneIndex % 2 === 1;
  const canDrop = Boolean(canReschedule && draggingTaskId && onTaskDrop);
  const dailyCap = dailyCapacityHours(teammate);

  // Live resize preview WITHOUT disturbing layout:
  //   • Multi-row assignment uses ORIGINAL spans (not preview spans), so
  //     other chips never shift rows when the active chip widens or shrinks.
  //   • Multi-day cards being resized render in-place with a wider/narrower
  //     width via --span override; their row stays pinned.
  //   • Single-day cards being resized are HIDDEN; an overlay chip handles
  //     the visual preview so the cell stack height stays constant.
  const previewingId = resize?.card.id ?? null;
  const previewSpan = resize
    ? Math.max(1, resize.targetEndIndex - resize.card.dayIndex + 1)
    : 1;
  const previewIsOverlay = Boolean(resize) && !resize!.card.isMultiDay;

  const displayCards: CalendarCard[] = cards.flatMap((c) => {
    if (!resize || resize.card.id !== c.id) return [c];
    if (c.isMultiDay) {
      return [{ ...c, span: previewSpan, isMultiDay: true }];
    }
    return [];
  });
  // For row layout we IGNORE the preview span — pinning rows to the original
  // span avoids the row-shuffle flicker when the active chip grows.
  const multiCardsForLayout = cards.filter((c) => c.isMultiDay);
  const multiCards = displayCards.filter((c) => c.isMultiDay);
  const singleCards = displayCards.filter((c) => !c.isMultiDay);
  const overlayCard: CalendarCard | null = resize && previewIsOverlay
    ? { ...resize.card, span: previewSpan, isMultiDay: true }
    : null;
  // Row assignment is pinned to ORIGINAL spans so the lane layout doesn't
  // shuffle while the active chip is being resized.
  const multiRows = assignMultiRows(multiCardsForLayout);
  const multiRowCount = multiRows.size === 0
    ? 0
    : Math.max(...Array.from(multiRows.values())) + 1;
  const multiBandHeight = multiRowCount > 0
    ? multiRowCount * MULTI_CHIP_HEIGHT + Math.max(0, multiRowCount - 1) * MULTI_ROW_GAP + STACK_OFFSET
    : 0;

  const singleByDay = new Map<number, CalendarCard[]>();
  for (const c of singleCards) {
    const arr = singleByDay.get(c.dayIndex) ?? [];
    arr.push(c);
    singleByDay.set(c.dayIndex, arr);
  }

  // Per-day load (multi-day chips spread their hours evenly across days).
  // Uses the previewed cards so the load bars reflect the in-flight resize.
  const loadByDay = new Map<number, number>();
  for (const c of displayCards) {
    const perDay = c.estimatedHours / Math.max(1, c.span);
    for (let i = 0; i < c.span; i++) {
      const di = c.dayIndex + i;
      loadByDay.set(di, (loadByDay.get(di) ?? 0) + perDay);
    }
  }

  const toggleCell = (di: number) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(di)) next.delete(di);
      else next.add(di);
      return next;
    });
  };

  const laneVars = {
    '--multi-band-height': `${multiBandHeight}px`,
    '--multi-chip-height': `${MULTI_CHIP_HEIGHT}px`,
    '--multi-row-gap': `${MULTI_ROW_GAP}px`,
    '--stack-offset': `${STACK_OFFSET}px`,
    '--single-gap': `${SINGLE_GAP}px`,
    '--lane-min-height': `${MIN_LANE_HEIGHT}px`,
  } as CSSProperties;

  return (
    <div className="cal-lane" style={laneVars}>
      <div className={`cal-lane-label${isOdd ? ' is-odd' : ''}`}>
        <div className="cal-lane-label-inner">
          <TeammateAvatar
            name={teammate.displayName}
            avatarUrl={teammate.avatarUrl}
            avatarColor={teammate.avatarColor}
            size={26}
          />
          <div className="cal-lane-name-wrap">
            <span className="cal-lane-name">{teammate.displayName}</span>
            {teammate.title && <span className="cal-lane-title">{teammate.title}</span>}
          </div>
        </div>
        {laneLabelExtra ? (
          <div className="cal-lane-label-extra">{laneLabelExtra}</div>
        ) : null}
      </div>

      <div className="cal-lane-grid">
        {dayDates.map((date, di) => {
          const hidden = activeDayIndex !== null && di !== activeDayIndex;
          const cellSingles = singleByDay.get(di) ?? [];
          const isExpanded = expandedCells.has(di);
          const visible = isExpanded ? cellSingles : cellSingles.slice(0, VISIBLE_CAP);
          const overflow = cellSingles.length - visible.length;
          const dayLoad = loadByDay.get(di) ?? 0;
          const overloaded = dailyCap > 0 && dayLoad > dailyCap + 1e-6;
          const showLoadBar = dailyCap > 0 && dayLoad > 0;
          const loadPct = dailyCap > 0 ? Math.min(150, (dayLoad / dailyCap) * 100) : 0;

          // Multi-day chips that START in this cell render here, absolutely
          // positioned to span across to the right. Cells they pass through
          // simply don't render the chip themselves.
          const startingMulti = multiCards.filter((c) => c.dayIndex === di);

          const inResizeRange = resize
            && resize.card.teammateId === teammate.id
            && di >= resize.startDayIndex
            && di <= resize.targetEndIndex;
          return (
            <div
              key={`${teammate.id}-${localDateKey(date)}`}
              data-day-index={di}
              data-teammate-id={teammate.id}
              className={`cal-day-cell${hidden ? ' is-hidden' : ''}${isOdd ? ' is-odd' : ''}${dropDayIndex === di ? ' is-drop-hover' : ''}${inResizeRange ? ' is-resize-preview' : ''}`}
              onDragOver={useNativeDrag ? (e) => {
                if (!canDrop || hidden) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropDayIndex(di);
              } : undefined}
              onDragLeave={useNativeDrag ? () => {
                if (dropDayIndex === di) setDropDayIndex(null);
              } : undefined}
              onDrop={useNativeDrag ? (e) => {
                if (!canDrop || hidden || !draggingTaskId || !onTaskDrop) return;
                e.preventDefault();
                const taskId = e.dataTransfer.getData('application/x-recgon-task') || draggingTaskId;
                setDropDayIndex(null);
                onTaskDrop({ taskId, teammateId: teammate.id, dayDate: date });
              } : undefined}
            >
              {showLoadBar && (
                <div className={`cal-day-load${overloaded ? ' is-overloaded' : ''}`}>
                  <div className="cal-day-load-bar" style={{ width: `${Math.min(100, loadPct)}%` }} />
                  <span className="cal-day-load-text">
                    {dayLoad.toFixed(dayLoad % 1 === 0 ? 0 : 1)}h
                  </span>
                </div>
              )}

              {/* Multi-day chips that begin here, spanning right across cells. */}
              {startingMulti.map((card) => {
                const row = multiRows.get(card.id) ?? 0;
                return (
                  <div
                    key={`multi-${card.id}`}
                    className={`cal-multi-anchor${previewingId === card.id ? ' is-resizing' : ''}`}
                    style={{
                      '--span': card.span,
                      '--row': row,
                    } as CSSProperties}
                  >
                    <EventChip
                      card={card}
                      teammate={teammate}
                      onClick={onCardClick}
                      draggable={chipDraggable}
                      onDragStart={onTaskDragStart}
                      onDragEnd={onTaskDragEnd}
                      resizable={canReschedule && Boolean(onTaskResize)}
                      onResizeStart={handleResizeStart}
                    />
                  </div>
                );
              })}

              {/* Resize overlay: a single-day card being extended renders here
                  at the start cell, spanning the previewed width. Drawn outside
                  the multi-band rowing system so cell heights stay stable. */}
              {overlayCard && overlayCard.dayIndex === di && (
                <div
                  key={`overlay-${overlayCard.id}`}
                  className="cal-resize-overlay"
                  style={{ '--span': overlayCard.span } as CSSProperties}
                >
                  <EventChip
                    card={overlayCard}
                    teammate={teammate}
                    onClick={() => {}}
                    draggable={false}
                  />
                </div>
              )}

              <div className="cal-card-stack">
                {visible.map((card) => (
                  <EventChip
                    key={card.id}
                    card={card}
                    teammate={teammate}
                    onClick={onCardClick}
                    draggable={chipDraggable}
                    onDragStart={onTaskDragStart}
                    onDragEnd={onTaskDragEnd}
                    resizable={canReschedule && Boolean(onTaskResize)}
                    onResizeStart={handleResizeStart}
                  />
                ))}
                {(overflow > 0 || (isExpanded && cellSingles.length > VISIBLE_CAP)) && (
                  <button type="button" className="cal-day-more" onClick={() => toggleCell(di)}>
                    {isExpanded ? '− less' : `+ ${overflow} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.cal-lane { display: contents; }
.cal-lane-label {
  display: flex;
  align-items: flex-start;
  padding: 0;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  position: sticky;
  left: 0;
  background: var(--bg-card);
  z-index: 2;
  min-width: 0;
  min-height: var(--lane-min-height, 96px);
  box-sizing: border-box;
}
.cal-lane-label.is-odd { background: linear-gradient(0deg, rgba(var(--signature-rgb), 0.018), rgba(var(--signature-rgb), 0.018)), var(--bg-card); }
.cal-lane-label {
  flex-direction: column;
  align-items: stretch;
}
.cal-lane-label-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  box-sizing: border-box;
  min-width: 0;
}
.cal-lane-label-extra {
  padding: 0 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.cal-lane-name-wrap { display: flex; flex-direction: column; min-width: 0; }
.cal-lane-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--txt-pure);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.6px;
  text-transform: uppercase;
}
.cal-lane-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  color: var(--txt-faint);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.cal-lane-grid { display: contents; }
.cal-day-cell {
  border-bottom: 1px solid var(--rule);
  border-right: 1px solid var(--rule);
  padding: var(--stack-offset, 8px) 8px 8px;
  padding-top: calc(var(--stack-offset, 8px) + var(--multi-band-height, 0px));
  display: flex;
  flex-direction: column;
  gap: var(--single-gap, 4px);
  min-height: var(--lane-min-height, 96px);
  position: relative;
  overflow: visible;
  box-sizing: border-box;
}
.cal-day-cell:nth-child(7) { border-right: none; }
.cal-day-cell.is-odd { background: rgba(var(--signature-rgb), 0.012); }
.cal-day-cell.is-hidden { display: none; }
.cal-day-cell.is-drop-hover {
  background:
    linear-gradient(0deg, rgba(var(--signature-rgb), 0.09), rgba(var(--signature-rgb), 0.09)),
    var(--bg-card);
  box-shadow: inset 0 0 0 1px rgba(var(--signature-rgb), 0.32);
}
.cal-day-cell.is-resize-preview {
  background:
    linear-gradient(0deg, rgba(var(--signature-rgb), 0.06), rgba(var(--signature-rgb), 0.06)),
    var(--bg-card);
}

/* Multi-day chip anchor: positioned absolutely in the cell where the chip
   STARTS, with width extending across (--span) cells. Stacks vertically by
   --row to avoid overlaps. */
.cal-multi-anchor {
  position: absolute;
  top: calc(var(--stack-offset, 8px) + var(--row, 0) * (var(--multi-chip-height, 28px) + var(--multi-row-gap, 4px)));
  left: 6px;
  right: auto;
  width: calc(var(--span, 1) * 100% + (var(--span, 1) - 1) * 1px - 12px);
  height: var(--multi-chip-height, 28px);
  z-index: calc(8 + var(--row, 0));
}
.cal-multi-anchor:hover { z-index: 50; }
.cal-multi-anchor > .cal-chip { width: 100%; height: 100%; }
.cal-multi-anchor.is-resizing {
  z-index: 60;
  transition: none;
  /* Let elementFromPoint see the cell underneath while we drag; otherwise
     the chip itself reports as the target and the resize logic snaps the
     span back to the start cell. */
  pointer-events: none;
}
.cal-multi-anchor.is-resizing > .cal-chip {
  border-color: rgba(var(--signature-rgb), 0.7);
  box-shadow:
    0 0 12px rgba(var(--signature-rgb), 0.45),
    0 0 24px rgba(var(--signature-rgb), 0.20);
  transition: none;
  pointer-events: none;
}

/* Overlay chip rendered when a single-day card is being extended. Uses the
   same width math as cal-multi-anchor but with a high z-index so it floats
   above any existing multi-day chips in the start cell. Layout-neutral. */
.cal-resize-overlay {
  position: absolute;
  top: var(--stack-offset, 8px);
  left: 6px;
  width: calc(var(--span, 1) * 100% + (var(--span, 1) - 1) * 1px - 12px);
  height: var(--multi-chip-height, 28px);
  z-index: 100;
  pointer-events: none;
  transition: none;
}
.cal-resize-overlay > .cal-chip {
  width: 100%;
  height: 100%;
  border-color: rgba(var(--signature-rgb), 0.85);
  box-shadow:
    0 0 12px rgba(var(--signature-rgb), 0.55),
    0 0 28px rgba(var(--signature-rgb), 0.25);
  transition: none;
}

.cal-day-load {
  position: relative;
  height: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.10);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 7px;
  flex-shrink: 0;
}
.cal-day-load-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: rgb(var(--signature-rgb));
  box-shadow:
    0 0 6px rgba(var(--signature-rgb), 0.70),
    0 0 14px rgba(var(--signature-rgb), 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition: width 200ms ease;
}
.cal-day-load-text {
  position: relative;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--txt-pure);
  letter-spacing: 0.6px;
  z-index: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.cal-card-stack {
  display: flex;
  flex-direction: column;
  gap: var(--single-gap, 4px);
  min-width: 0;
}
.cal-day-more {
  background: transparent;
  border: none;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--txt-muted);
  padding: 4px 2px;
  cursor: pointer;
  text-align: left;
  transition: color 140ms ease;
  align-self: flex-start;
}
.cal-day-more:hover { color: var(--signature); }
`;
