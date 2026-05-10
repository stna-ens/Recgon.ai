'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import { WeekNav } from './WeekNav';
import { WeekHeader } from './WeekHeader';
import { SwimLane } from './SwimLane';
import { UnscheduledSidebar } from './UnscheduledSidebar';
import type { CalendarCard, WeekRange } from './calendarTypes';
import { addWeeks, buildCards, getWeekRange, localDateKey, weekDays } from './calendarUtils';

type ServerData = {
  teammates: TeammateWithStats[];
  tasks: AgentTask[];
};

type Props = {
  projectId: string;
  onSwitchToList?: () => void;
};

const TASK_DRAG_MIME = 'application/x-recgon-task';

export function WeekCalendar({ projectId, onSwitchToList }: Props) {
  const { currentTeam } = useTeam();
  const { addToast } = useToast();
  const teamId = currentTeam?.id ?? null;
  const isOwner = currentTeam?.role === 'owner';

  const [weekRange, setWeekRange] = useState<WeekRange>(() => getWeekRange(new Date()));
  const [data, setData] = useState<ServerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  const fetch_ = useCallback(async (opts: { initial?: boolean } = {}) => {
    if (!teamId) return;
    if (opts.initial) setLoading(true); else setRefreshing(true);
    try {
      const url = `/api/teams/${teamId}/calendar?projectId=${encodeURIComponent(projectId)}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch { /* swallowed */ }
    setLoading(false);
    setRefreshing(false);
  }, [teamId, projectId]);

  useEffect(() => { fetch_({ initial: true }); }, [fetch_]);

  useEffect(() => {
    const onFocus = () => fetch_();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetch_]);

  // Poll while verification is in-flight.
  useEffect(() => {
    verifyingRef.current = (data?.tasks ?? []).some(
      (t) => t.verificationStatus === 'auto_running' || t.verificationStatus === 'proof_evaluating',
    );
    if (!verifyingRef.current) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetch_();
    }, 1500);
    return () => clearInterval(id);
  }, [data, fetch_]);

  // Detect narrow screen → single-day mode.
  useEffect(() => {
    const check = () => {
      if (window.innerWidth < 700) {
        const today = new Date();
        const days = weekDays(weekRange);
        const todayIdx = days.findIndex(
          (d) => d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(),
        );
        setActiveDayIndex(todayIdx >= 0 ? todayIdx : 0);
      } else {
        setActiveDayIndex(null);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [weekRange]);

  const days = useMemo(() => weekDays(weekRange), [weekRange]);

  const cardsByTeammate = useMemo<Map<string, CalendarCard[]>>(() => {
    if (!data) return new Map();
    const map = new Map<string, CalendarCard[]>();
    for (const tm of data.teammates) {
      map.set(tm.id, buildCards(data.tasks, tm.id, weekRange));
    }
    return map;
  }, [data, weekRange]);

  const unscheduledTasks = useMemo(
    () => (data?.tasks ?? []).filter((t) => !t.scheduledDate),
    [data],
  );

  const handleCardClick = useCallback((_card: CalendarCard) => {}, []);

  const handlePrev = () => setWeekRange((w) => addWeeks(w, -1));
  const handleNext = () => setWeekRange((w) => addWeeks(w, 1));
  const handleToday = () => setWeekRange(getWeekRange(new Date()));

  const handleDayNav = (delta: number) => {
    setActiveDayIndex((prev) => {
      if (prev === null) return null;
      const next = prev + delta;
      if (next < 0) { setWeekRange((w) => addWeeks(w, -1)); return 6; }
      if (next > 6) { setWeekRange((w) => addWeeks(w, 1)); return 0; }
      return next;
    });
  };

  const clearDrag = useCallback(() => {
    setDraggingTaskId(null);
  }, []);

  const beginTaskDrag = useCallback((e: DragEvent<HTMLElement>, taskId: string) => {
    if (!isOwner) return;
    setDraggingTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TASK_DRAG_MIME, taskId);
    e.dataTransfer.setData('text/plain', taskId);
  }, [isOwner]);

  const handleTaskDrop = useCallback(async (input: {
    taskId: string;
    teammateId: string;
    dayDate: Date;
  }) => {
    if (!teamId || !isOwner || !data) return;
    const task = data.tasks.find((t) => t.id === input.taskId);
    if (!task) return;

    const newStart = localDateKey(input.dayDate);
    // Preserve the original duration: if this was a multi-day task (start →
    // until), shift `until` by the same delta so the span stays the same.
    let newUntil: string | null = null;
    if (task.scheduledDate && task.scheduledUntilDate && task.scheduledUntilDate > task.scheduledDate) {
      const startDate = new Date(`${task.scheduledDate}T00:00:00Z`);
      const untilDate = new Date(`${task.scheduledUntilDate}T00:00:00Z`);
      const durationDays = Math.round((untilDate.getTime() - startDate.getTime()) / 86_400_000);
      const shifted = new Date(`${newStart}T00:00:00Z`);
      shifted.setUTCDate(shifted.getUTCDate() + durationDays);
      newUntil = shifted.toISOString().slice(0, 10);
    }
    const lastDay = newUntil ?? newStart;
    const hours = Math.max(0.25, Number(task.estimatedHours) || 1);
    const rangeLabel = newUntil ? `${newStart} → ${newUntil}` : newStart;
    const scheduleNote = `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h reserved on ${rangeLabel} by the team owner.`;
    const dayEndIso = new Date(`${lastDay}T23:59:59Z`).toISOString();

    setData((prev) => {
      if (!prev) return prev;
      const nextTasks = prev.tasks.map((t) => (
        t.id === input.taskId
          ? {
              ...t,
              assignedTo: input.teammateId,
              status: t.assignedTo === input.teammateId && t.status !== 'unassigned' ? t.status : 'assigned',
              scheduledDate: newStart,
              scheduledUntilDate: newUntil,
              deadline: dayEndIso,
              scheduleNote,
              rescheduleRequestStatus: t.rescheduleRequestStatus === 'pending' ? 'resolved' : t.rescheduleRequestStatus,
            }
          : t
      ));
      return { ...prev, tasks: nextTasks };
    });
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks/${input.taskId}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          teammateId: input.teammateId,
          scheduledDate: newStart,
          scheduledUntilDate: newUntil,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'reschedule failed');
      }
      addToast('task rescheduled', 'success');
      await fetch_();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'reschedule failed', 'error');
      await fetch_();
    } finally {
      clearDrag();
    }
  }, [addToast, clearDrag, data, fetch_, isOwner, teamId]);

  const handleTaskResize = useCallback(async (input: {
    taskId: string;
    scheduledUntilDate: string | null;
  }) => {
    if (!teamId || !isOwner || !data) return;
    const task = data.tasks.find((t) => t.id === input.taskId);
    if (!task || !task.scheduledDate || !task.assignedTo) return;
    if (input.scheduledUntilDate === task.scheduledUntilDate) return;
    const newUntil = input.scheduledUntilDate;
    const lastDay = newUntil ?? task.scheduledDate;
    const hours = Math.max(0.25, Number(task.estimatedHours) || 1);
    const rangeLabel = newUntil ? `${task.scheduledDate} → ${newUntil}` : task.scheduledDate;
    const scheduleNote = `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h reserved on ${rangeLabel} by the team owner.`;
    const dayEndIso = new Date(`${lastDay}T23:59:59Z`).toISOString();

    setData((prev) => {
      if (!prev) return prev;
      const nextTasks = prev.tasks.map((t) => (
        t.id === input.taskId
          ? { ...t, scheduledUntilDate: newUntil, deadline: dayEndIso, scheduleNote }
          : t
      ));
      return { ...prev, tasks: nextTasks };
    });
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks/${input.taskId}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          teammateId: task.assignedTo,
          scheduledDate: task.scheduledDate,
          scheduledUntilDate: newUntil,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'resize failed');
      }
      addToast(newUntil ? 'span updated' : 'span collapsed to one day', 'success');
      await fetch_();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'resize failed', 'error');
      await fetch_();
    }
  }, [addToast, data, fetch_, isOwner, teamId]);

  const activeTeammates = data?.teammates.filter((tm) => tm.status !== 'retired') ?? [];

  return (
    <div className="week-cal-root">
      <WeekNav
        week={weekRange}
        onPrev={activeDayIndex !== null ? () => handleDayNav(-1) : handlePrev}
        onNext={activeDayIndex !== null ? () => handleDayNav(1) : handleNext}
        onToday={handleToday}
        viewMode="calendar"
        onToggleView={() => onSwitchToList?.()}
        unscheduledCount={unscheduledTasks.length}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        refreshing={refreshing}
      />

      {loading ? (
        <div className="week-cal-loading" aria-busy="true" aria-live="polite">
          <div className="week-cal-skel-grid">
            <div className="week-cal-skel-corner" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`h-${i}`} className="week-cal-skel-head" />
            ))}
            {[0, 1, 2].map((row) => (
              <Fragment key={`r-${row}`}>
                <div className="week-cal-skel-label" />
                {Array.from({ length: 7 }).map((_, ci) => (
                  <div key={`c-${row}-${ci}`} className="week-cal-skel-cell" />
                ))}
              </Fragment>
            ))}
          </div>
          <span className="week-cal-skel-shimmer" aria-hidden="true" />
          <span className="week-cal-skel-loading-label">loading week</span>
        </div>
      ) : (
        <div className="week-cal-outer">
          <div className="week-cal-scroll">
            <div
              className="week-cal-grid"
              style={{ gridTemplateColumns: `var(--cal-label-width, 180px) repeat(${activeDayIndex !== null ? 1 : 7}, minmax(var(--cal-day-min-width, 110px), 1fr))` }}
            >
              <WeekHeader dayDates={days} activeDayIndex={activeDayIndex} />

              {activeTeammates.length === 0 ? (
                <div className="week-cal-empty" style={{ gridColumn: `1 / ${(activeDayIndex !== null ? 1 : 7) + 2}` }}>
                  No teammates in this team yet.
                </div>
              ) : (
                activeTeammates.map((tm, idx) => (
                  <SwimLane
                    key={tm.id}
                    teammate={tm}
                    cards={cardsByTeammate.get(tm.id) ?? []}
                    dayDates={days}
                    activeDayIndex={activeDayIndex}
                    onCardClick={handleCardClick}
                    laneIndex={idx}
                    canReschedule={isOwner}
                    draggingTaskId={draggingTaskId}
                    onTaskDrop={handleTaskDrop}
                    onTaskDragStart={(e, card) => beginTaskDrag(e, card.task.id)}
                    onTaskDragEnd={clearDrag}
                    onTaskResize={handleTaskResize}
                  />
                ))
              )}
            </div>
          </div>

          {sidebarOpen && (
            <UnscheduledSidebar
              tasks={unscheduledTasks}
              onSelect={() => setSidebarOpen(false)}
              canDrag={isOwner}
              onDragStart={(e, task) => beginTaskDrag(e, task.id)}
              onDragEnd={clearDrag}
            />
          )}
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

const css = `
.week-cal-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  animation: v2pageFade 500ms cubic-bezier(0.2,0.8,0.2,1) both;
  --cal-label-width: 180px;
  --cal-day-min-width: 110px;
}
@keyframes v2pageFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.week-cal-outer {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--rule);
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card, rgba(30,30,35,0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  flex: 1;
}
.week-cal-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 240ms ease;
}
.week-cal-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.week-cal-scroll::-webkit-scrollbar-track { background: transparent; }
.week-cal-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background 240ms ease;
}
.week-cal-scroll:hover { scrollbar-color: rgba(var(--signature-rgb), 0.30) transparent; }
.week-cal-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(var(--signature-rgb), 0.30);
  background-clip: padding-box;
}
.week-cal-grid { display: grid; min-width: 0; width: 100%; }

.week-cal-loading {
  position: relative;
  border: 1px solid var(--rule);
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card, rgba(30,30,35,0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.week-cal-skel-grid {
  display: grid;
  grid-template-columns: var(--cal-label-width, 180px) repeat(7, minmax(var(--cal-day-min-width, 110px), 1fr));
}
.week-cal-skel-corner,
.week-cal-skel-head {
  height: 64px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.week-cal-skel-label,
.week-cal-skel-cell {
  height: 96px;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.week-cal-skel-shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(var(--signature-rgb), 0.10) 50%,
    transparent 100%);
  background-size: 35% 100%;
  background-repeat: no-repeat;
  background-position: -35% 0;
  animation: calSkelSweep 2400ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.week-cal-skel-loading-label {
  position: absolute;
  bottom: 14px;
  right: 16px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--signature);
  opacity: 0.7;
}
@keyframes calSkelSweep {
  0%   { background-position: -35% 0; }
  100% { background-position: 135% 0; }
}

.week-cal-empty {
  padding: 48px 24px;
  font-size: 14px;
  color: var(--txt-muted);
  text-align: center;
  border-bottom: 1px solid var(--rule);
}

@media (max-width: 700px) {
  .week-cal-root { --cal-label-width: 48px; --cal-day-min-width: 0px; }
  .week-cal-grid { min-width: unset; }
  .cal-lane-name-wrap { display: none; }
}
`;
