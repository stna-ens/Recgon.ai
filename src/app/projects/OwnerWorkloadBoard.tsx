// dnd-kit STABLE v6 — import from @dnd-kit/core only. Do NOT import from @dnd-kit/react (v2.0-pre).
// Multi-owner concurrent drag = last-write-wins per CONTEXT D-deferred. Document only; no defensive code in v1.
//
// Phase 3.5 / Plan 03.5-01 — owner-only workload board shell.
//
// Scope of this plan (Wave 1):
//   - 14-day grid scaffold (header row + one empty SwimLane per active teammate)
//   - DndContext mounted at the grid root with PointerSensor + KeyboardSensor
//   - SwimLane wired with dragMode="dnd-kit" (Plan 01 Task 1) so the existing
//     HTML5 wiring is suppressed and an outer dnd-kit DragOverlay can take over.
//
// Out of scope (lands in later plans):
//   - Chips (cards={[]} here); chip data + per-week capacity bar land in 03.5-02.
//   - Triage dock placeholder only; the real TriageDock component lands in 03.5-02.
//   - onDragEnd is a no-op; drag wiring (reassign + reschedule) lands in 03.5-03.
//   - View toggle (workload / table) lands in 03.5-04.
//
// Companion docs: 03.5-UI-SPEC §4, 03.5-RESEARCH § Pattern 1, 03.5-PATTERNS lines 51-94.

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
import { SwimLane } from '@/components/v2/calendar/SwimLane';
import { WeekHeader } from '@/components/v2/calendar/WeekHeader';
import { getWeekRange, weekDays } from '@/components/v2/calendar/calendarUtils';
import type { TeammateWithStats } from '@/lib/recgon/types';

type Props = {
  teamId: string;
};

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
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [teammates, setTeammates] = useState<TeammateWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const dayDates = useMemo(() => build14DayWindow(anchor), [anchor]);
  const rangeStart = dayDates[0];
  const rangeEnd = dayDates[dayDates.length - 1];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/teams/${teamId}/teammates`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { teammates: [] }))
      .then((data: { teammates?: TeammateWithStats[] }) => {
        if (cancelled) return;
        const list = (data.teammates ?? []).filter((t) => t.status === 'active');
        setTeammates(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTeammates([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [teamId]);

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
    // No-op for Wave 1. Reassign + reschedule lands in 03.5-03.
  }, []);

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

      {/* TriageDock lands in 03.5-02. */}
      <aside className="owner-board-dock-placeholder" aria-label="Triage dock placeholder" data-testid="owner-board-dock-placeholder" />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="owner-board-outer">
          <div className="owner-board-scroll">
            <div
              className="owner-board-grid"
              style={{
                gridTemplateColumns: `var(--cal-label-width, 180px) repeat(${VISIBLE_DAYS}, minmax(var(--cal-day-min-width, 110px), 1fr))`,
              }}
              data-testid="owner-board-grid"
            >
              <WeekHeader dayDates={dayDates} activeDayIndex={null} rowLabel="TEAMMATE" />

              {loading ? (
                <div className="owner-board-loading" style={{ gridColumn: `1 / ${VISIBLE_DAYS + 2}` }} aria-busy="true">
                  loading teammates…
                </div>
              ) : teammates.length === 0 ? (
                <div className="owner-board-empty" style={{ gridColumn: `1 / ${VISIBLE_DAYS + 2}` }}>
                  No active teammates in this team yet.
                </div>
              ) : (
                teammates.map((tm, idx) => (
                  <SwimLane
                    key={tm.id}
                    teammate={tm}
                    cards={[]}
                    dayDates={dayDates}
                    activeDayIndex={null}
                    onCardClick={() => {}}
                    laneIndex={idx}
                    canReschedule={false}
                    draggingTaskId={null}
                    dragMode="dnd-kit"
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </DndContext>

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
  --cal-label-width: 180px;
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
  padding: 18px 22px 14px;
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

.owner-board-dock-placeholder {
  /* Placeholder slot — real TriageDock arrives in 03.5-02. Zero height + no
     visible chrome so the grid floats up against the page header. */
  height: 0;
  margin: 0;
  padding: 0;
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
.owner-board-grid {
  display: grid;
  min-width: 100%;
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
