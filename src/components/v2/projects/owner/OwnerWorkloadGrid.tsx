// Phase 3.5 / Plan 03.5-02 — owner workload grid (14-day SwimLanes + chips).
//
// Reuses the calendar SwimLane (with dragMode="dnd-kit" — outer DndContext
// is mounted by OwnerWorkloadBoard) and WeekHeader components verbatim.
// CapacityBars ride into SwimLane via the new `laneLabelExtra` slot (Plan
// 03.5-02 SwimLane extension) so the grid stays a clean 1 + N column layout.
//
// Card layout is built inline here because the calendar utility `buildCards`
// scopes to a 7-day week; for the 14-day owner grid we map task scheduled
// dates against the supplied 14-element `dayDates` array directly.

'use client';

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

// Build CalendarCard[] for a single teammate over the 14-day window.
// Multi-day tasks (scheduledUntilDate > scheduledDate) clamp into the window.
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

export function OwnerWorkloadGrid({ teammates, tasks, dayDates, onChipClick }: Props) {
  // Split the 14-day window into Wk 1 (days 0-6) and Wk 2 (days 7-13) for
  // capacity-bar math.
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
          />
        );
      })}
    </div>
  );
}
