// dnd-kit STABLE v6 — import from @dnd-kit/core only. Do NOT import from @dnd-kit/react (v2.0-pre).
// Multi-owner concurrent drag = last-write-wins per CONTEXT D-deferred. Document only; no defensive code in v1.
//
// Phase 3.5 / Plan 03.5-02 — owner-only workload board: dock + grid + chip detail.
//
// What this board renders (D-05/07/10/11/12/13):
//   - TriageDock above the grid: collapsed pill when count=0, expanded
//     glass-card with row-per-task when count>0. Deferred tasks appear here
//     AND in the calendar grid (D-13 "appears in BOTH").
//   - 14-day grid (`OwnerWorkloadGrid`): one row per active teammate,
//     CapacityBars in the lane label (Wk1 + Wk2), chips in day cells.
//   - Chip click → TaskDetailPanel (existing component). Detail fetch goes
//     through `/api/recgon/tasks/[id]` which applies the privacy filter on
//     whyYouSentence — the bulk dock/board fetches NEVER carry it.
//
// Out of scope (lands in later plans):
//   - Drag-to-reassign / drag-to-reschedule wiring (03.5-03).
//   - Triage Dock assign-manually picker + dismiss action (03.5-03).
//   - View toggle (workload / table — 03.5-04).
//
// Companion docs: 03.5-UI-SPEC §4/§6, 03.5-CONTEXT D-05/07/10/11/12/13/14.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useTeam } from '@/components/TeamProvider';
import { getWeekRange, weekDays, localDateKey } from '@/components/v2/calendar/calendarUtils';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import { TriageDock } from '@/components/v2/projects/owner/TriageDock';
import { OwnerWorkloadGrid } from '@/components/v2/projects/owner/OwnerWorkloadGrid';

type Props = {
  teamId: string;
};

type DockData = { triaged: AgentTask[]; deferred: AgentTask[] };
type BoardData = { teammates: TeammateWithStats[]; tasks: AgentTask[] };

const VISIBLE_DAYS = 14;

// Build a 14-day window starting from the Monday of the anchor week
// (D-06: default = this week + next).
function build14DayWindow(anchor: Date): Date[] {
  const week1 = getWeekRange(anchor);
  const week1Days = weekDays(week1);
  const week2Days = week1Days.map((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 7);
    return next;
  });
  return [...week1Days, ...week2Days];
}

function formatMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export function OwnerWorkloadBoard({ teamId }: Props) {
  const { currentTeam } = useTeam();
  const isOwner = currentTeam?.role === 'owner';

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [dock, setDock] = useState<DockData | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);

  const dayDates = useMemo(() => build14DayWindow(anchor), [anchor]);
  const rangeStart = dayDates[0];
  const rangeEnd = dayDates[dayDates.length - 1];
  const startISO = localDateKey(rangeStart);
  const endISO = localDateKey(rangeEnd);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Fetch dock + board in parallel. Re-runs on teamId or window change.
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    const dockReq = fetch(`/api/recgon/owner/dock?teamId=${encodeURIComponent(teamId)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`dock fetch failed (${r.status})`);
        return (await r.json()) as DockData;
      });

    const boardReq = fetch(
      `/api/recgon/owner/board?teamId=${encodeURIComponent(teamId)}&startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`,
      { cache: 'no-store' },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`board fetch failed (${r.status})`);
      return (await r.json()) as BoardData;
    });

    Promise.all([dockReq, boardReq])
      .then(([dockData, boardData]) => {
        if (cancelled) return;
        setDock(dockData);
        setBoard(boardData);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'couldn’t reach recgon');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId, startISO, endISO]);

  const handlePrev = useCallback(() => {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() - VISIBLE_DAYS);
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + VISIBLE_DAYS);
      return next;
    });
  }, []);

  const handleToday = useCallback(() => setAnchor(new Date()), []);

  // onDragEnd wired in 03.5-03.
  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    // No-op for Wave 2. Reassign + reschedule lands in 03.5-03.
  }, []);

  // Chip click: open TaskDetailPanel. We pre-fetch the detail row via the
  // existing privacy-filtered route so whyYouSentence (when authorized) is
  // populated before the panel mounts.
  const handleChipClick = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/recgon/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json() as { task: AgentTask };
      setSelectedTask(body.task);
    } catch {
      // Swallow — chip click failure is non-fatal; user can click again.
    }
  }, []);

  const closePanel = useCallback(() => setSelectedTask(null), []);

  // D-13: deferred tasks appear in BOTH the dock AND the calendar grid. We
  // therefore concat the dock's deferred bucket with the board's assigned
  // tasks before passing to the grid.
  const gridTasks = useMemo<AgentTask[]>(() => {
    const assigned = board?.tasks ?? [];
    const deferred = dock?.deferred ?? [];
    return [...assigned, ...deferred];
  }, [board, dock]);

  const teammates = board?.teammates ?? [];

  const headlineYear = rangeStart.getFullYear() === rangeEnd.getFullYear()
    ? String(rangeStart.getFullYear())
    : `${rangeStart.getFullYear()}/${rangeEnd.getFullYear()}`;

  return (
    <div className="owner-board-root" data-testid="owner-workload-board">
      <header className="owner-board-nav">
        <div className="owner-board-nav-left">
          <span className="recgon-label cal-nav-eyebrow">PROJECTS</span>
          <h1 className="cal-nav-headline">
            <span className="cal-nav-headline-primary">
              Workload — {formatMonthDay(rangeStart)} → {formatMonthDay(rangeEnd)}
            </span>
            <span className="cal-nav-headline-year">{headlineYear}</span>
          </h1>
        </div>
        <div className="owner-board-nav-right">
          <button type="button" className="owner-board-nav-btn" onClick={handlePrev} aria-label="Previous 2 weeks">⟨</button>
          <button type="button" className="owner-board-nav-btn" onClick={handleToday} aria-label="Today">today</button>
          <button type="button" className="owner-board-nav-btn" onClick={handleNext} aria-label="Next 2 weeks">⟩</button>
        </div>
      </header>

      <TriageDock
        triaged={dock?.triaged ?? []}
        deferred={dock?.deferred ?? []}
        onAssignClick={(_id) => { /* picker lands in 03.5-03 */ }}
        onDismissClick={(_id) => { /* wired in 03.5-03 */ }}
      />

      {errorMessage && (
        <div className="owner-board-error" role="alert">
          couldn&rsquo;t reach recgon — {errorMessage}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="owner-board-outer">
          <div className="owner-board-scroll" data-testid="owner-board-grid">
            {/* Always render the grid so the 14 day-headers + empty-row chrome
                are present even before the teammate fetch settles (Wave 1
                shellRender locks .cal-day-header count and the testid above).
                The grid tolerates an empty teammates array (renders header
                row only). */}
            <OwnerWorkloadGrid
              teammates={teammates}
              tasks={gridTasks}
              dayDates={dayDates}
              onChipClick={handleChipClick}
            />
            {!loading && teammates.length === 0 && (
              <div className="owner-board-empty">No active teammates in this team yet.</div>
            )}
            {loading && (
              <div className="owner-board-loading" aria-busy="true">loading workload…</div>
            )}
          </div>
        </div>
      </DndContext>

      <TaskDetailPanel
        task={selectedTask}
        isOpen={selectedTask !== null}
        currentTeammateId={null}
        isOwner={isOwner}
        onClose={closePanel}
        onRefresh={closePanel}
      />

      <style>{css}</style>
    </div>
  );
}

const css = `
.owner-board-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: ownerBoardFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  --cal-label-width: 220px;
  --cal-day-min-width: 110px;
  padding-bottom: 32px;
  max-width: 1440px;
  margin: 0 auto;
}
@keyframes ownerBoardFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.owner-board-nav {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 4px;
  flex-wrap: wrap;
}
.owner-board-nav-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.cal-nav-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2.0px;
  color: var(--signature);
  text-transform: uppercase;
  line-height: 1;
}
.cal-nav-headline {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
  flex-wrap: wrap;
}
.cal-nav-headline-primary {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--txt-pure);
  line-height: 1;
}
.cal-nav-headline-year {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: var(--txt-faint);
  line-height: 1;
}
.owner-board-nav-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.owner-board-nav-btn {
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--txt-muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: lowercase;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease;
  line-height: 1;
}
.owner-board-nav-btn:hover {
  color: var(--txt-pure);
  border-color: var(--rule-strong);
}

.owner-board-error {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.4px;
  color: var(--danger, #ff6b6b);
  padding: 10px 16px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: rgba(255, 80, 80, 0.06);
}

.owner-board-outer {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--rule);
  border-radius: 28px;
  overflow: hidden;
  background: var(--bg-card, rgba(30, 30, 35, 0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.owner-board-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 240ms ease;
}
.owner-board-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.owner-board-scroll::-webkit-scrollbar-track { background: transparent; }
.owner-board-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 6px;
}
.owner-board-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(var(--signature-rgb), 0.2);
}
.owner-board-loading,
.owner-board-empty {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--txt-faint);
  text-transform: uppercase;
  padding: 36px 22px;
  text-align: center;
}
`;
