// dnd-kit STABLE v6 — import from @dnd-kit/core only. Do NOT import from @dnd-kit/react (v2.0-pre).
// Multi-owner concurrent drag = last-write-wins per CONTEXT D-deferred. Document only; no defensive code in v1.
//
// Phase 3.5 — owner-only workload board.
//   Plan 03.5-01 — page shell + role router + DndContext mount.
//   Plan 03.5-02 — TriageDock + OwnerWorkloadGrid + capacity bars + chip detail.
//   Plan 03.5-03 — inline actions wired (manual-assign picker on dock rows,
//                  dismiss × on deferred rows, reschedule picker on chip
//                  detail panel) + drag-drop (chip→lane, chip→day, dock→cell)
//                  with optimistic UI + rollback + ConfirmDialog interception
//                  for in-flight chips. Reschedule reuses the existing
//                  /api/teams/[id]/tasks/[taskId]/schedule endpoint (already
//                  owner-gated). Manual-assign reuses /api/recgon/tasks/[id]/assign.
//                  Dismiss POSTs to /api/recgon/owner/dock/dismiss (new endpoint).
//
// What this board renders (D-05/07/10/11/12/13):
//   - TriageDock above the grid with inline assign picker + dismiss action.
//   - 14-day grid (`OwnerWorkloadGrid`) with chips wrapped in useDraggable
//     and cells in useDroppable. Lane labels are secondary droppables
//     (drop on label keeps the chip's existing date).
//   - Chip click → TaskDetailPanel. Owner panel includes a "reschedule"
//     button that opens the ReschedulePicker popover.
//   - In-flight chips (`accepted` | `in_progress`) trigger ConfirmDialog
//     BEFORE reassign (UI-SPEC §7).

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
import { useToast } from '@/components/Toast';
import { getWeekRange, weekDays, localDateKey } from '@/components/v2/calendar/calendarUtils';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';
import { TriageDock } from '@/components/v2/projects/owner/TriageDock';
import { OwnerWorkloadGrid } from '@/components/v2/projects/owner/OwnerWorkloadGrid';
import { ReschedulePicker } from '@/components/v2/projects/owner/ReschedulePicker';
import ConfirmDialog from '@/components/ConfirmDialog';

type Props = {
  teamId: string;
};

type DockData = { triaged: AgentTask[]; deferred: AgentTask[] };
type BoardData = { teammates: TeammateWithStats[]; tasks: AgentTask[] };

const VISIBLE_DAYS = 14;

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

// Decode a dnd-kit drop-target-id.
// Cell    → "{teammateId}__{YYYY-MM-DD}"
// Lane    → "{teammateId}__lane"
// Dock    → "dock"  (returns null in v1; reverse-drag not in scope)
type DropTarget =
  | { kind: 'cell'; teammateId: string; dateISO: string }
  | { kind: 'lane'; teammateId: string };

export function decodeDropTarget(id: string): DropTarget | null {
  if (id === 'dock') return null; // reverse-drag ignored in v1
  const laneMatch = id.match(/^(.+)__lane$/);
  if (laneMatch) return { kind: 'lane', teammateId: laneMatch[1] };
  const cellMatch = id.match(/^(.+)__(\d{4}-\d{2}-\d{2})$/);
  if (cellMatch) {
    return { kind: 'cell', teammateId: cellMatch[1], dateISO: cellMatch[2] };
  }
  return null;
}

export function OwnerWorkloadBoard({ teamId }: Props) {
  const { currentTeam } = useTeam();
  const { addToast } = useToast();
  const isOwner = currentTeam?.role === 'owner';

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [dock, setDock] = useState<DockData | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [reschedulePickerOpen, setReschedulePickerOpen] = useState(false);

  // Plan 03.5-03 — optimistic overrides mirror src/app/tasks/page.tsx:134-217.
  // Keyed by task.id; cleared by useEffect when the server state catches up.
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, Partial<AgentTask>>>({});

  // Plan 03.5-03 — per-user dismiss optimistic state. The server filters
  // dismissed deferred rows on the next dock GET, but we hide locally first.
  const [dismissedOptimistic, setDismissedOptimistic] = useState<Set<string>>(new Set());

  // Plan 03.5-03 — pending in-flight reassign awaiting ConfirmDialog approval.
  const [pendingInFlight, setPendingInFlight] = useState<{
    task: AgentTask;
    target: DropTarget;
    isFromDock: boolean;
  } | null>(null);

  const dayDates = useMemo(() => build14DayWindow(anchor), [anchor]);
  const rangeStart = dayDates[0];
  const rangeEnd = dayDates[dayDates.length - 1];
  const startISO = localDateKey(rangeStart);
  const endISO = localDateKey(rangeEnd);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // refreshAll re-fetches dock + board. Called after mutations so the optimistic
  // override clears the moment the server confirms the change.
  const refreshAll = useCallback(async () => {
    if (!teamId) return;
    try {
      const [dockRes, boardRes] = await Promise.all([
        fetch(`/api/recgon/owner/dock?teamId=${encodeURIComponent(teamId)}`, { cache: 'no-store' }),
        fetch(
          `/api/recgon/owner/board?teamId=${encodeURIComponent(teamId)}&startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`,
          { cache: 'no-store' },
        ),
      ]);
      if (dockRes.ok) setDock((await dockRes.json()) as DockData);
      if (boardRes.ok) setBoard((await boardRes.json()) as BoardData);
    } catch {
      // Background refresh; surface only via explicit error paths.
    }
  }, [teamId, startISO, endISO]);

  // Initial fetch + window-change re-fetch.
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

  // ── helpers ────────────────────────────────────────────────────────────

  const teammates = board?.teammates ?? [];

  /** Apply optimistic overrides on top of a real task. */
  const applyOverride = useCallback(
    (t: AgentTask): AgentTask => ({ ...t, ...(optimisticOverrides[t.id] ?? {}) }),
    [optimisticOverrides],
  );

  /**
   * Find a task by id across all sources (board.tasks, dock.triaged,
   * dock.deferred). Returns null if not found.
   */
  const findTaskById = useCallback(
    (taskId: string): AgentTask | null => {
      const candidates: AgentTask[] = [
        ...(board?.tasks ?? []),
        ...(dock?.triaged ?? []),
        ...(dock?.deferred ?? []),
      ];
      const raw = candidates.find((t) => t.id === taskId);
      return raw ? applyOverride(raw) : null;
    },
    [board, dock, applyOverride],
  );

  /**
   * Clear optimistic override for a single task id.
   */
  const clearOverride = useCallback((taskId: string) => {
    setOptimisticOverrides((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  // ── inline actions ─────────────────────────────────────────────────────

  /**
   * Dock manual-assign — owner picks a teammate from the inline dropdown.
   * Reuses /api/recgon/tasks/[id]/assign (Plan 03-07 owner-gated).
   */
  const handleAssign = useCallback(
    async (taskId: string, teammateId: string) => {
      // Optimistic: hide from triaged bucket by writing assignedTo + status.
      setOptimisticOverrides((prev) => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          assignedTo: teammateId,
          status: 'assigned',
          triageNote: null,
        },
      }));
      try {
        const res = await fetch(`/api/recgon/tasks/${encodeURIComponent(taskId)}/assign`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assigneeId: teammateId }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'assign failed');
        }
        const tm = teammates.find((t) => t.id === teammateId);
        addToast(`assigned to ${tm?.displayName ?? 'teammate'}`, 'success');
        await refreshAll();
        clearOverride(taskId);
      } catch (err) {
        clearOverride(taskId);
        addToast(err instanceof Error ? err.message : 'couldn’t assign — try again', 'error');
      }
    },
    [teammates, addToast, refreshAll, clearOverride],
  );

  /**
   * Deferred dismiss — owner clicks × on a deferred dock row.
   * Reuses POST /api/recgon/owner/dock/dismiss (Plan 03.5-03 new endpoint).
   */
  const handleDismiss = useCallback(
    async (taskId: string) => {
      // Optimistic hide for THIS viewer.
      setDismissedOptimistic((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
      try {
        const res = await fetch('/api/recgon/owner/dock/dismiss', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'dismiss failed');
        }
        // Silent success per UI-SPEC §7 (no toast on routine dismiss).
        await refreshAll();
      } catch (err) {
        setDismissedOptimistic((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        addToast(err instanceof Error ? err.message : 'couldn’t dismiss — try again', 'error');
      }
    },
    [addToast, refreshAll],
  );

  /**
   * Reschedule chip via picker (called from TaskDetailPanel slot).
   * Reuses POST /api/teams/[id]/tasks/[taskId]/schedule. Body shape mirrors
   * WeekCalendar.handleTaskDrop exactly: { teammateId, scheduledDate, scheduledUntilDate }.
   */
  const handleRescheduleFromPicker = useCallback(
    async (newDateISO: string) => {
      const task = selectedTask;
      if (!task || !task.assignedTo) return;
      setOptimisticOverrides((prev) => ({
        ...prev,
        [task.id]: { ...prev[task.id], scheduledDate: newDateISO, scheduledUntilDate: null },
      }));
      try {
        const res = await fetch(`/api/teams/${teamId}/tasks/${task.id}/schedule`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            teammateId: task.assignedTo,
            scheduledDate: newDateISO,
            scheduledUntilDate: null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'reschedule failed');
        }
        const friendly = new Date(`${newDateISO}T00:00:00`).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        }).toUpperCase();
        addToast(`moved to ${friendly}`, 'success');
        await refreshAll();
        clearOverride(task.id);
      } catch (err) {
        clearOverride(task.id);
        addToast(err instanceof Error ? err.message : 'couldn’t move — try again', 'error');
      }
    },
    [selectedTask, teamId, addToast, refreshAll, clearOverride],
  );

  // ── drag-drop ──────────────────────────────────────────────────────────

  /**
   * Core drop handler shared by mouse + keyboard drag. Decodes target,
   * computes deltas, runs optimistic state, fires API calls, rolls back on
   * error. In-flight chips route through pendingInFlight + ConfirmDialog.
   */
  const performDrop = useCallback(
    async (
      task: AgentTask,
      target: DropTarget,
      isFromDock: boolean,
    ): Promise<void> => {
      const newTeammateId = target.teammateId;
      const newDate = target.kind === 'cell' ? target.dateISO : task.scheduledDate;

      const assigneeChanged = newTeammateId !== task.assignedTo;
      const dateChanged = newDate !== null && newDate !== task.scheduledDate;
      const triggersAssign = assigneeChanged || isFromDock || task.status === 'unassigned';

      if (!triggersAssign && !dateChanged) {
        // Same teammate + same date → no-op.
        return;
      }

      // Optimistic.
      const overrideFields: Partial<AgentTask> = {};
      if (triggersAssign) {
        overrideFields.assignedTo = newTeammateId;
        overrideFields.status = 'assigned';
        overrideFields.triageNote = null;
      }
      if (dateChanged && newDate) {
        overrideFields.scheduledDate = newDate;
        overrideFields.scheduledUntilDate = null;
      }
      setOptimisticOverrides((prev) => ({
        ...prev,
        [task.id]: { ...prev[task.id], ...overrideFields },
      }));

      let assignOk = !triggersAssign;
      let scheduleOk = !dateChanged;

      try {
        if (triggersAssign) {
          // For owner drag-drop reassign we use the existing assign endpoint.
          // It currently only works on unassigned tasks (status==='unassigned')
          // — for already-assigned chips dragged to another lane we fall
          // through to the schedule endpoint which accepts a teammate swap
          // alongside a date (matches WeekCalendar.handleTaskDrop). The
          // assign endpoint is used only when the chip is in the dock OR
          // currently unassigned.
          if (task.status === 'unassigned' || isFromDock) {
            const res = await fetch(
              `/api/recgon/tasks/${encodeURIComponent(task.id)}/assign`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ assigneeId: newTeammateId }),
              },
            );
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.error || 'assign failed');
            }
          }
          assignOk = true;
        }

        // The schedule endpoint accepts BOTH teammateId + date, so we always
        // route a reassign that involves an already-assigned chip through it
        // (mirrors WeekCalendar.handleTaskDrop). When only the date changed
        // we still POST schedule. When only the teammate changed on an
        // already-assigned chip we ALSO POST schedule (keeping the same
        // scheduledDate). When neither changed we already returned above.
        const needsSchedulePost =
          dateChanged ||
          (assigneeChanged && task.status !== 'unassigned' && !isFromDock);
        if (needsSchedulePost && newDate) {
          const res = await fetch(
            `/api/teams/${teamId}/tasks/${encodeURIComponent(task.id)}/schedule`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                teammateId: newTeammateId,
                scheduledDate: newDate,
                scheduledUntilDate: null,
              }),
            },
          );
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || 'schedule failed');
          }
        }
        scheduleOk = true;

        // Toast — single op or combined.
        const tm = teammates.find((t) => t.id === newTeammateId);
        const friendlyDate = newDate
          ? new Date(`${newDate}T00:00:00`).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            }).toUpperCase()
          : '';
        if (assigneeChanged && dateChanged) {
          addToast(`assigned to ${tm?.displayName ?? 'teammate'} on ${friendlyDate}`, 'success');
        } else if (assigneeChanged) {
          addToast(`assigned to ${tm?.displayName ?? 'teammate'}`, 'success');
        } else if (dateChanged) {
          addToast(`moved to ${friendlyDate}`, 'success');
        }
        await refreshAll();
        clearOverride(task.id);
      } catch (err) {
        // Partial failure handling: if assign succeeded but schedule failed,
        // we keep the assign override and clear only the date override.
        // Mirrors UI-SPEC §7 graceful-degradation guidance.
        if (assignOk && !scheduleOk) {
          setOptimisticOverrides((prev) => {
            const next = { ...prev };
            const cur = next[task.id];
            if (cur) {
              const cleaned: Partial<AgentTask> = { ...cur };
              delete cleaned.scheduledDate;
              delete cleaned.scheduledUntilDate;
              next[task.id] = cleaned;
            }
            return next;
          });
          addToast(
            err instanceof Error
              ? `reassigned but couldn’t reschedule — ${err.message}`
              : 'reassigned but couldn’t reschedule',
            'error',
          );
        } else {
          clearOverride(task.id);
          addToast(err instanceof Error ? err.message : 'couldn’t move — try again', 'error');
        }
      }
    },
    [teammates, teamId, addToast, refreshAll, clearOverride],
  );

  /**
   * dnd-kit onDragEnd handler. Mounts the in-flight ConfirmDialog when the
   * dragged task is `accepted` or `in_progress` AND the reassign is real.
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return; // dropped outside any droppable → no-op (Test 8)
      const taskId = String(active.id);
      const dropTargetId = String(over.id);
      const target = decodeDropTarget(dropTargetId);
      if (!target) return;
      const task = findTaskById(taskId);
      if (!task) return;

      const kindData = active.data.current?.kind;
      const isFromDock = kindData === 'dock-row';

      // In-flight guard (UI-SPEC §7): reassign on accepted/in_progress chips
      // requires ConfirmDialog approval before mutating.
      const assigneeChanged = target.teammateId !== task.assignedTo;
      const isInFlight = task.status === 'accepted' || task.status === 'in_progress';
      if (assigneeChanged && isInFlight) {
        setPendingInFlight({ task, target, isFromDock });
        return;
      }

      void performDrop(task, target, isFromDock);
    },
    [findTaskById, performDrop],
  );

  // ── chip click → detail panel ──────────────────────────────────────────

  const handleChipClick = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/recgon/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = await res.json() as { task: AgentTask };
      setSelectedTask(body.task);
    } catch {
      // Non-fatal.
    }
  }, []);

  const closePanel = useCallback(() => {
    setSelectedTask(null);
    setReschedulePickerOpen(false);
  }, []);

  // ── view ──────────────────────────────────────────────────────────────

  // Apply overrides + dismissedOptimistic to dock/board before rendering.
  // Filter strategy:
  //   - dismissedOptimistic removes per-user dismissed deferred rows.
  //   - For deferred rows we DO NOT additionally filter on
  //     `assignedTo === null` because Wave-2 invariant D-13 lets a deferred
  //     task ride into the grid alongside the dock when it has a soft
  //     assignee. The optimistic-clear of triaged after manual-assign is
  //     handled by an explicit predicate: a row with an override that
  //     promotes status to 'assigned' AND clears triageNote is no longer
  //     part of the dock buckets.
  const visibleDeferred = useMemo(
    () => (dock?.deferred ?? [])
      .filter((t) => !dismissedOptimistic.has(t.id))
      .map(applyOverride)
      // Drop rows that an optimistic override has just promoted out of the
      // deferred bucket (e.g., the owner just rescheduled them onto today
      // or earlier). Deferred bucket = scheduledDate > today; we approximate
      // by trusting the server snapshot unless an override explicitly
      // changes assignment state.
      .filter((t) => optimisticOverrides[t.id]?.status !== 'assigned' || !optimisticOverrides[t.id]?.assignedTo),
    [dock, dismissedOptimistic, applyOverride, optimisticOverrides],
  );
  const visibleTriaged = useMemo(
    () => (dock?.triaged ?? [])
      .map(applyOverride)
      // After optimistic-assign, the row's override flips status to 'assigned'
      // and clears triageNote → drop it from the triaged bucket.
      .filter((t) => t.triageNote !== null && t.assignedTo === null),
    [dock, applyOverride],
  );

  // Grid tasks: assigned board tasks + remaining deferred (still unassigned),
  // each with optimistic overrides applied. Re-assigned dock tasks land in
  // the grid only after refreshAll catches them; the optimistic override
  // keeps them out of the dock in the meantime.
  const gridTasks = useMemo<AgentTask[]>(() => {
    const assigned = (board?.tasks ?? []).map(applyOverride);
    const deferred = (dock?.deferred ?? []).map(applyOverride);
    // After optimistic override flips a dock row to assigned, that row also
    // belongs in the grid (so the chip appears in its new lane immediately).
    const triaged = (dock?.triaged ?? []).map(applyOverride).filter((t) => t.assignedTo !== null);
    return [...assigned, ...deferred, ...triaged];
  }, [board, dock, applyOverride]);

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
        triaged={visibleTriaged}
        deferred={visibleDeferred}
        teammates={teammates}
        onAssign={handleAssign}
        onDismiss={handleDismiss}
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
        ownerScheduledActions={isOwner && selectedTask?.scheduledDate ? (
          <ReschedulePicker
            open={reschedulePickerOpen}
            onOpenChange={setReschedulePickerOpen}
            currentDate={selectedTask?.scheduledDate ?? null}
            trigger={
              <button
                type="button"
                className="cal-panel-btn is-owner"
                data-testid="owner-reschedule-trigger"
                onClick={() => setReschedulePickerOpen(true)}
              >
                reschedule
              </button>
            }
            onReschedule={handleRescheduleFromPicker}
          />
        ) : undefined}
      />

      <ConfirmDialog
        open={pendingInFlight !== null}
        onOpenChange={(open) => {
          if (!open) setPendingInFlight(null);
        }}
        title="Reassign in-flight task?"
        description={
          pendingInFlight ? (
            <>
              <strong>{pendingInFlight.task.title}</strong> is currently in flight.
              Reassigning will hand it to a new teammate and replace any work in
              progress. Continue?
            </>
          ) : null
        }
        confirmLabel="reassign"
        cancelLabel="cancel"
        destructive
        onConfirm={async () => {
          if (!pendingInFlight) return;
          const { task, target, isFromDock } = pendingInFlight;
          setPendingInFlight(null);
          await performDrop(task, target, isFromDock);
        }}
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

.cal-panel-owner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.cal-panel-btn.is-owner {
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--txt-muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.0px;
  text-transform: uppercase;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease;
}
.cal-panel-btn.is-owner:hover {
  color: var(--signature);
  border-color: var(--signature);
}
`;
