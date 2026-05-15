// Phase 3.5 / Plan 03.5-04 — owner-only secondary "table" view.
//
// Sortable 6-column all-mono table that mirrors the data in OwnerWorkloadGrid
// (workload primary). Reuses the same task list — no new endpoint — so
// privacy filtering (assignment_reasoning stripped per 03.5-02 Pitfall 3) is
// preserved automatically.
//
// Columns: TASK / ASSIGNEE / PROJECT / DATE / PRIORITY / STATE.
// Header click toggles ascending → descending → ascending sort on that column;
// clicking a different header switches the active column and resets to asc.
// Per-row kebab (⋯) opens a Radix DropdownMenu with `assign manually`
// (visible when triaged / unassigned) + `reschedule` (visible when assigned),
// both delegating to props — no fetches live in this component.
//
// Drag-drop is NOT wired here (workload-only per UI-SPEC §4 / D-08). Switching
// from workload → table preserves any in-flight optimistic state because the
// override map lives on OwnerWorkloadBoard, not on the per-view component.

'use client';

import { useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { AgentTask, TeammateWithStats } from '@/lib/recgon/types';

type ColumnKey = 'task' | 'assignee' | 'project' | 'date' | 'priority' | 'state';
type SortDirection = 'asc' | 'desc';

export type ProjectInfo = { id: string; name: string };

type Props = {
  tasks: AgentTask[];
  teammates: TeammateWithStats[];
  projects: ProjectInfo[];
  onRowClick: (task: AgentTask) => void;
  onAssign: (task: AgentTask) => void;
  onReschedule: (task: AgentTask) => void;
};

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'task', label: 'TASK' },
  { key: 'assignee', label: 'ASSIGNEE' },
  { key: 'project', label: 'PROJECT' },
  { key: 'date', label: 'DATE' },
  { key: 'priority', label: 'PRIORITY' },
  { key: 'state', label: 'STATE' },
];

const PRIORITY_LABEL: Record<number, string> = {
  0: 'urgent',
  1: 'high',
  2: 'normal',
  3: 'low',
};

function priorityColor(p: number): string {
  if (p <= 0) return 'var(--danger, #ff6b6b)';
  if (p === 1) return 'var(--warning, #ff9f0a)';
  if (p === 3) return 'var(--txt-faint, rgba(255,255,255,0.4))';
  return 'var(--txt-muted, rgba(255,255,255,0.65))';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  // Use the same upper-case month-day format as the rest of the owner board.
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

function teammateName(teammates: TeammateWithStats[], id: string | null): string {
  if (!id) return '—';
  return teammates.find((t) => t.id === id)?.displayName ?? '—';
}

function projectName(projects: ProjectInfo[], id: string | null): string {
  if (!id) return '—';
  return projects.find((p) => p.id === id)?.name ?? '—';
}

/**
 * Default initial sort: by scheduledDate ascending. Plan §behavior.
 *
 * `sort` may be `null` to represent the uninteracted state — render order
 * still defaults to date asc (so the table is never random on first paint),
 * but no header shows the ↑ glyph yet. The first click on any header sets
 * sort to `{ column, direction: 'asc' }` (even if the user clicks DATE,
 * matching the test's expectation that the first DATE click "activates"
 * the column visibly). Subsequent clicks on the same column toggle.
 */
type Sort = { column: ColumnKey; direction: SortDirection } | null;

function compareTasks(
  a: AgentTask,
  b: AgentTask,
  column: ColumnKey,
  direction: SortDirection,
  teammates: TeammateWithStats[],
  projects: ProjectInfo[],
): number {
  let cmp = 0;
  switch (column) {
    case 'task':
      cmp = a.title.localeCompare(b.title);
      break;
    case 'assignee':
      cmp = teammateName(teammates, a.assignedTo).localeCompare(teammateName(teammates, b.assignedTo));
      break;
    case 'project':
      cmp = projectName(projects, a.projectId).localeCompare(projectName(projects, b.projectId));
      break;
    case 'date': {
      // Null dates always sort last regardless of direction.
      const aN = a.scheduledDate === null;
      const bN = b.scheduledDate === null;
      if (aN && !bN) return 1;
      if (!aN && bN) return -1;
      if (aN && bN) {
        cmp = 0;
      } else {
        cmp = (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '');
      }
      break;
    }
    case 'priority':
      cmp = a.priority - b.priority;
      break;
    case 'state':
      cmp = a.status.localeCompare(b.status);
      break;
  }
  if (cmp === 0) {
    // Deterministic tie-breaker per plan: task.id ascending (independent of direction).
    return a.id.localeCompare(b.id);
  }
  return direction === 'asc' ? cmp : -cmp;
}

export function TableBoard({
  tasks,
  teammates,
  projects,
  onRowClick,
  onAssign,
  onReschedule,
}: Props) {
  const [sort, setSort] = useState<Sort>(null);

  const sortedTasks = useMemo(() => {
    const copy = [...tasks];
    // Default ordering when no user interaction yet: by date asc.
    const activeColumn: ColumnKey = sort?.column ?? 'date';
    const activeDirection: SortDirection = sort?.direction ?? 'asc';
    copy.sort((a, b) => compareTasks(a, b, activeColumn, activeDirection, teammates, projects));
    return copy;
  }, [tasks, sort, teammates, projects]);

  const onHeaderClick = (column: ColumnKey) => {
    setSort((prev) => {
      if (prev === null) return { column, direction: 'asc' };
      if (prev.column !== column) return { column, direction: 'asc' };
      return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  return (
    <div className="table-board-outer" data-testid="owner-table-board">
      <div role="table" className="table-board" aria-label="Owner task table">
        <div role="rowgroup" className="table-board-head">
          <div role="row" className="table-board-head-row">
            {COLUMNS.map((c) => {
              const isActive = sort?.column === c.key;
              return (
                <div role="columnheader" key={c.key} className={`table-board-th th-${c.key}`}>
                  <button
                    type="button"
                    className={`table-board-sort-btn${isActive ? ' is-active' : ''}`}
                    aria-label={`sort by ${c.label.toLowerCase()}`}
                    onClick={() => onHeaderClick(c.key)}
                  >
                    <span className="table-board-th-label">{c.label}</span>
                    {isActive && sort && (
                      <span className="table-board-th-glyph" aria-hidden="true">
                        {sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            <div role="columnheader" className="table-board-th th-actions" aria-label="actions" />
          </div>
        </div>

        <div role="rowgroup" className="table-board-body">
          {sortedTasks.length === 0 ? (
            <div className="table-board-empty">No tasks scheduled in this window.</div>
          ) : (
            sortedTasks.map((task) => {
              const isUnassigned = task.assignedTo === null || task.triageNote !== null;
              const isAssigned = task.assignedTo !== null;

              return (
                <div
                  key={task.id}
                  role="button"
                  aria-label={`open task ${task.title}`}
                  className="table-board-row"
                  tabIndex={0}
                  onClick={() => onRowClick(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(task);
                    }
                  }}
                  data-testid={`table-board-row-${task.id}`}
                >
                  <div role="cell" className="table-board-td td-task">
                    <span className="table-board-task-title">{task.title}</span>
                  </div>
                  <div role="cell" className="table-board-td td-assignee">
                    {teammateName(teammates, task.assignedTo)}
                  </div>
                  <div role="cell" className="table-board-td td-project">
                    {projectName(projects, task.projectId)}
                  </div>
                  <div role="cell" className="table-board-td td-date">
                    {fmtDate(task.scheduledDate)}
                  </div>
                  <div role="cell" className="table-board-td td-priority">
                    <span style={{ color: priorityColor(task.priority) }}>
                      {PRIORITY_LABEL[task.priority] ?? 'normal'}
                    </span>
                  </div>
                  <div role="cell" className="table-board-td td-state">
                    {task.status.replace(/_/g, ' ')}
                  </div>
                  <div
                    role="cell"
                    className="table-board-td td-actions"
                    // Stop propagation so a kebab click does not also fire onRowClick.
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className="table-board-kebab"
                          aria-label="task actions"
                          data-testid={`table-board-kebab-${task.id}`}
                        >
                          ⋯
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="table-board-menu"
                          sideOffset={6}
                          align="end"
                          data-testid={`table-board-menu-${task.id}`}
                        >
                          {isUnassigned && (
                            <DropdownMenu.Item
                              className="table-board-menu-item"
                              onSelect={() => onAssign(task)}
                              data-testid={`table-board-menu-assign-${task.id}`}
                            >
                              assign manually
                            </DropdownMenu.Item>
                          )}
                          {isAssigned && (
                            <DropdownMenu.Item
                              className="table-board-menu-item"
                              onSelect={() => onReschedule(task)}
                              data-testid={`table-board-menu-reschedule-${task.id}`}
                            >
                              reschedule
                            </DropdownMenu.Item>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
.table-board-outer {
  border: 1px solid var(--rule);
  border-radius: 28px;
  background: var(--bg-card, rgba(30, 30, 35, 0.55));
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}
.table-board {
  display: flex;
  flex-direction: column;
  width: 100%;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
.table-board-head {
  border-bottom: 1px solid var(--rule);
  background: rgba(255, 255, 255, 0.015);
}
.table-board-head-row,
.table-board-row {
  display: grid;
  grid-template-columns: 2fr 1.1fr 1.1fr 0.9fr 0.8fr 0.9fr 48px;
  align-items: center;
  gap: 0;
}
.table-board-head-row {
  min-height: 36px;
}
.table-board-row {
  min-height: 44px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 140ms ease;
  outline: none;
}
.table-board-row:hover {
  background: rgba(var(--signature-rgb), 0.04);
}
.table-board-row:focus-visible {
  background: rgba(var(--signature-rgb), 0.06);
  box-shadow: inset 0 0 0 1px rgba(var(--signature-rgb), 0.35);
}
.table-board-row:last-child {
  border-bottom: none;
}
.table-board-th,
.table-board-td {
  padding: 8px 14px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-board-th {
  display: flex;
  align-items: center;
}
.table-board-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--txt-faint);
  transition: color 140ms ease;
}
.table-board-sort-btn:hover {
  color: var(--signature);
}
.table-board-sort-btn.is-active {
  color: var(--txt-pure);
}
.table-board-sort-btn:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
  border-radius: 2px;
}
.table-board-th-glyph {
  color: var(--signature);
  font-size: 11px;
  text-shadow: 0 0 6px var(--signature);
}
.table-board-td {
  font-size: 12px;
  color: var(--txt-muted);
  letter-spacing: 0.2px;
}
.table-board-td.td-task {
  color: var(--txt-pure);
  font-weight: 600;
}
.table-board-task-title {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.table-board-td.td-priority,
.table-board-td.td-state,
.table-board-td.td-date {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.table-board-td.td-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
}
.table-board-kebab {
  background: transparent;
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  color: var(--txt-faint);
  font-size: 18px;
  line-height: 1;
  border-radius: 4px;
  transition: color 140ms ease, background 140ms ease;
}
.table-board-kebab:hover {
  color: var(--signature);
  background: rgba(var(--signature-rgb), 0.06);
}
.table-board-kebab:focus-visible {
  outline: 2px solid var(--signature);
  outline-offset: 2px;
}
.table-board-empty {
  padding: 36px 22px;
  text-align: center;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--txt-faint);
  text-transform: uppercase;
}
.table-board-menu {
  min-width: 180px;
  padding: 6px;
  background: var(--glass-substrate, rgba(20, 20, 22, 0.92));
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.10));
  border-radius: var(--r-sm, 8px);
  box-shadow: var(--shadow-deep, 0 22px 50px -22px rgba(0,0,0,0.45));
  z-index: 9999;
  animation: tableBoardMenuIn 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes tableBoardMenuIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.table-board-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1.0px;
  text-transform: lowercase;
  color: var(--txt-muted);
  outline: none;
  transition: background 120ms ease, color 120ms ease;
}
.table-board-menu-item[data-highlighted],
.table-board-menu-item:focus-visible {
  background: rgba(var(--signature-rgb), 0.08);
  color: var(--signature);
}
`;
