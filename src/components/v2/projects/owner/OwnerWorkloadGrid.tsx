// Phase 3.5 / Plan 03.5-02 + 03 — owner workload grid (14-day SwimLanes + chips).
//
// Plan 03.5-02 shipped: reuse SwimLane + WeekHeader, attach CapacityBars via
// the new laneLabelExtra slot, render 14 days.
//
// Plan 03.5-03 adds: dnd-kit wrappers around each chip (useDraggable), each
// day cell (useDroppable, id="{teammateId}__{dateISO}"), and each lane label
// (useDroppable, id="{teammateId}__lane"). The outer DndContext lives in
// OwnerWorkloadBoard so drop targets register across the whole page.

'use client';

import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import type { CalendarCard } from '@/components/v2/calendar/calendarTypes';
import { SwimLane } from '@/components/v2/calendar/SwimLane';
import { WeekHeader } from '@/components/v2/calendar/WeekHeader';
import { localDateKey } from '@/components/v2/calendar/calendarUtils';
import { weeklyScheduledHours } from '@/lib/recgon/match';
import { CapacityBar } from './CapacityBar';

type Props = {
  teammates: TeammateWithStats[];
  tasks: AgentTask[];
  dayDates: Date[]; // length 14
  onChipClick: (taskId: string) => void;
};

function buildCardsForWindow(
  tasks: AgentTask[],
  teammateId: string,
  dayDates: Date[],
): CalendarCard[] {
  if (dayDates.length === 0) return [];
  const dayKeys = dayDates.map(localDateKey);
  const firstKey = dayKeys[0];
  const lastKey = dayKeys[dayKeys.length - 1];

  const cards: CalendarCard[] = [];
  for (const task of tasks) {
    if (task.assignedTo !== teammateId) continue;
    if (!task.scheduledDate) continue;
    const startDate = task.scheduledDate;
    const endDate =
      task.scheduledUntilDate && task.scheduledUntilDate >= startDate
        ? task.scheduledUntilDate
        : startDate;
    if (endDate < firstKey) continue;
    if (startDate > lastKey) continue;

    const visibleStart = startDate < firstKey ? firstKey : startDate;
    const visibleEnd = endDate > lastKey ? lastKey : endDate;
    const dayIndex = dayKeys.indexOf(visibleStart);
    const endIndex = dayKeys.indexOf(visibleEnd);
    if (dayIndex === -1 || endIndex === -1) continue;
    const span = Math.max(1, endIndex - dayIndex + 1);
    cards.push({
      id: `task-${task.id}`,
      title: task.title,
      teammateId,
      scheduledDate: startDate,
      scheduledUntilDate: task.scheduledUntilDate,
      dayIndex,
      span,
      isMultiDay: endDate > startDate,
      estimatedHours: Math.max(0.25, Number(task.estimatedHours) || 1),
      task,
    });
  }
  return cards;
}

function formatWeekStart(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

// ── dnd-kit wrapper sub-components ─────────────────────────────────────────

/**
 * Wrap a rendered chip in useDraggable. Sets the drag-source id = task.id
 * + data { kind: 'task' } so OwnerWorkloadBoard.onDragEnd knows where the
 * chip came from.
 */
function DraggableChip({
  taskId,
  children,
}: {
  taskId: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: taskId,
    data: { kind: 'task' },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    touchAction: 'none', // recommended by dnd-kit for PointerSensor
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-testid={`draggable-chip-${taskId}`}
    >
      {children}
    </div>
  );
}

/**
 * Wrap a day cell in useDroppable with id "{teammateId}__{dateISO}".
 */
function DroppableCell({
  teammateId,
  dateISO,
  children,
}: {
  teammateId: string;
  dateISO: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teammateId}__${dateISO}`,
    data: { kind: 'cell', teammateId, dateISO },
  });
  return (
    <div
      ref={setNodeRef}
      data-droppable-id={`${teammateId}__${dateISO}`}
      data-is-over={isOver ? 'true' : undefined}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  );
}

/**
 * Wrap a lane label in useDroppable with id "{teammateId}__lane" so dropping
 * a chip onto the row label reassigns while keeping the chip's existing date.
 */
function DroppableLaneLabel({
  teammateId,
  children,
}: {
  teammateId: string;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teammateId}__lane`,
    data: { kind: 'lane', teammateId },
  });
  return (
    <div
      ref={setNodeRef}
      data-droppable-id={`${teammateId}__lane`}
      data-is-over={isOver ? 'true' : undefined}
      style={{ display: 'contents' }}
    >
      {children}
    </div>
  );
}

export function OwnerWorkloadGrid({ teammates, tasks, dayDates, onChipClick }: Props) {
  const wk1Start = dayDates[0];
  const wk2Start = dayDates[7];
  const wk1StartISO = wk1Start ? localDateKey(wk1Start) : '';
  const wk2StartISO = wk2Start ? localDateKey(wk2Start) : '';

  return (
    <div
      className="owner-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `var(--cal-label-width, 220px) repeat(${dayDates.length}, minmax(var(--cal-day-min-width, 110px), 1fr))`,
        minWidth: '100%',
      }}
      data-testid="owner-workload-grid"
    >
      <WeekHeader dayDates={dayDates} activeDayIndex={null} rowLabel="TEAMMATE" />

      {teammates.map((tm, idx) => {
        const cards = buildCardsForWindow(tasks, tm.id, dayDates);
        const wk1Hours = wk1StartISO ? weeklyScheduledHours(tasks, tm.id, wk1StartISO) : 0;
        const wk2Hours = wk2StartISO ? weeklyScheduledHours(tasks, tm.id, wk2StartISO) : 0;
        const extra = (
          <>
            <CapacityBar
              teammate={tm}
              scheduledHoursThisWeek={wk1Hours}
              weekIndex={1}
              weekStartLabel={wk1Start ? formatWeekStart(wk1Start) : ''}
            />
            <CapacityBar
              teammate={tm}
              scheduledHoursThisWeek={wk2Hours}
              weekIndex={2}
              weekStartLabel={wk2Start ? formatWeekStart(wk2Start) : ''}
            />
          </>
        );
        return (
          <SwimLane
            key={tm.id}
            teammate={tm}
            cards={cards}
            dayDates={dayDates}
            activeDayIndex={null}
            onCardClick={(card) => onChipClick(card.task.id)}
            laneIndex={idx}
            canReschedule={false}
            draggingTaskId={null}
            dragMode="dnd-kit"
            laneLabelExtra={extra}
            laneLabelWrapper={(node, ctx) => (
              <DroppableLaneLabel teammateId={ctx.teammateId}>{node}</DroppableLaneLabel>
            )}
            cellWrapper={(node, ctx) => (
              <DroppableCell teammateId={ctx.teammateId} dateISO={ctx.dateISO}>
                {node}
              </DroppableCell>
            )}
            chipWrapper={(node, ctx) => (
              <DraggableChip taskId={ctx.taskId}>{node}</DraggableChip>
            )}
          />
        );
      })}
    </div>
  );
}
