'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Select from '@/components/Select';
import { EmptyState } from '@/components/ui';
import { formatDay } from '@/lib/datetime';
import { useListShortcuts } from '@/lib/useListShortcuts';
import type { CommandProject, CommandTask, CommandTeammate } from './types';

// The team task list, Mission Control's second act. Status comes from the
// hero pills (the `view` prop); this component handles search, the
// secondary filters, grouping, and keyboard navigation. Rendered as a
// glass-card list — rows are CSS grid lines with a tone rail, not an
// admin-panel <table>.

export type CommandView = 'all' | 'mine' | 'active' | 'queued' | 'review' | 'overdue';

const ACTIVE = new Set(['assigned', 'accepted', 'in_progress']);
const LIVE = new Set(['assigned', 'accepted', 'in_progress', 'awaiting_review', 'unassigned']);

const STATUS_TONES: Record<string, 'mute' | 'info' | 'warn' | 'crit' | 'ok'> = {
  unassigned: 'mute',
  assigned: 'info',
  accepted: 'info',
  in_progress: 'info',
  awaiting_review: 'warn',
  completed: 'ok',
  declined: 'crit',
  failed: 'crit',
  cancelled: 'mute',
};

// Active work first, queued, review, then terminal — the order a PM scans in.
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  accepted: 1,
  assigned: 2,
  awaiting_review: 3,
  unassigned: 4,
  completed: 5,
  declined: 6,
  failed: 7,
  cancelled: 8,
};

const KINDS = ['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'];

type SortKey = 'default' | 'priority' | 'due';

export interface TeamTaskTableProps {
  tasks: CommandTask[];
  teammates: CommandTeammate[];
  projects: CommandProject[];
  onOpen: (task: CommandTask) => void;
  view: CommandView;
  currentTeammateId: string | null;
  // False while the detail panel is open so j/k don't move under it.
  shortcutsEnabled?: boolean;
}

function matchesView(task: CommandTask, view: CommandView, me: string | null): boolean {
  switch (view) {
    case 'mine':
      return me != null && task.assignedTo === me && LIVE.has(task.status);
    case 'active':
      return ACTIVE.has(task.status);
    case 'queued':
      return task.status === 'unassigned';
    case 'review':
      return task.status === 'awaiting_review';
    case 'overdue':
      return (task.overdueTier ?? 0) > 0 && ACTIVE.has(task.status);
    default:
      return true;
  }
}

export default function TeamTaskTable({
  tasks,
  teammates,
  projects,
  onOpen,
  view,
  currentTeammateId,
  shortcutsEnabled = true,
}: TeamTaskTableProps) {
  const t = useTranslations('command');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [project, setProject] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const teammateById = useMemo(() => {
    const m = new Map<string, CommandTeammate>();
    teammates.forEach((tm) => m.set(tm.id, tm));
    return m;
  }, [teammates]);
  const projectById = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const hasFilters = search.trim() !== '' || kind !== 'all' || assignee !== 'all' || project !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = tasks.filter((task) => {
      if (!matchesView(task, view, currentTeammateId)) return false;
      if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) return false;
      if (kind !== 'all' && task.kind !== kind) return false;
      if (assignee !== 'all') {
        if (assignee === 'none' ? task.assignedTo !== null : task.assignedTo !== assignee) return false;
      }
      if (project !== 'all' && task.projectId !== project) return false;
      return true;
    });
    const dueOf = (task: CommandTask) => task.deadline ?? task.scheduledUntilDate ?? task.scheduledDate;
    rows.sort((a, b) => {
      if (sortKey === 'priority') return (a.priority - b.priority) * sortDir;
      if (sortKey === 'due') {
        const da = dueOf(a);
        const db = dueOf(b);
        if (!da && !db) return 0;
        if (!da) return 1; // undated last regardless of direction
        if (!db) return -1;
        return da.localeCompare(db) * sortDir;
      }
      const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (so !== 0) return so;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, [tasks, view, currentTeammateId, search, kind, assignee, project, sortKey, sortDir]);

  const openByIndex = useCallback(
    (idx: number) => {
      const task = filtered[idx];
      if (task) onOpen(task);
    },
    [filtered, onOpen],
  );
  const [activeIdx, setActiveIdx] = useListShortcuts({
    count: filtered.length,
    enabled: shortcutsEnabled,
    onOpen: openByIndex,
  });

  useEffect(() => {
    if (activeIdx < 0) return;
    document.querySelector(`.v2-mct-row[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const toggleSort = (key: Exclude<SortKey, 'default'>) => {
    if (sortKey === key) {
      if (sortDir === -1) setSortDir(1);
      else {
        setSortKey('default');
        setSortDir(-1);
      }
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setKind('all');
    setAssignee('all');
    setProject('all');
  };

  const opt = (value: string, label: string) => ({ value, label });
  const allOpt = opt('all', t('table.filters.all'));

  // Group headers only make sense when statuses are mixed.
  const showGroups = (view === 'all' || view === 'mine') && sortKey === 'default';

  const railTone = (task: CommandTask): string => {
    if ((task.overdueTier ?? 0) > 0 && ACTIVE.has(task.status)) return 'var(--danger)';
    if (task.priority >= 3) return 'var(--warning)';
    return 'transparent';
  };

  let lastGroup: number | null = null;

  return (
    <section className="glass-card v2-mct" aria-label={t('table.heading')}>
      <div className="v2-mct-toolbar">
        <input
          type="search"
          className="v2-mct-search"
          placeholder={t('table.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('table.search')}
        />
        <div className="v2-mct-toolbar-filters">
          <Select
            size="sm"
            value={kind}
            onChange={setKind}
            placeholder={t('table.filters.kind')}
            options={[allOpt, ...KINDS.map((k) => opt(k, t(`kind.${k}`)))]}
          />
          {view !== 'mine' && (
            <Select
              size="sm"
              value={assignee}
              onChange={setAssignee}
              placeholder={t('table.filters.assignee')}
              options={[
                allOpt,
                opt('none', t('table.unassigned')),
                ...teammates.map((tm) => opt(tm.id, tm.displayName)),
              ]}
            />
          )}
          {projects.length > 0 && (
            <Select
              size="sm"
              value={project}
              onChange={setProject}
              placeholder={t('table.filters.project')}
              options={[allOpt, ...projects.map((p) => opt(p.id, p.name))]}
            />
          )}
          <button
            type="button"
            className="v2-mct-sort"
            data-active={sortKey === 'priority'}
            onClick={() => toggleSort('priority')}
          >
            {t('table.columns.priority')}
            <span aria-hidden="true">{sortKey === 'priority' ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}</span>
          </button>
          <button
            type="button"
            className="v2-mct-sort"
            data-active={sortKey === 'due'}
            onClick={() => toggleSort('due')}
          >
            {t('table.columns.due')}
            <span aria-hidden="true">{sortKey === 'due' ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}</span>
          </button>
          {hasFilters && (
            <button type="button" className="v2-mct-clear" onClick={clearFilters}>
              {t('table.filters.clear')}
            </button>
          )}
        </div>
        <span className="v2-mct-count">{t('table.count', { count: filtered.length })}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState compact title={hasFilters ? t('table.empty') : t('table.emptyTeam')} />
      ) : (
        <ol className="v2-mct-list">
          {filtered.map((task, idx) => {
            const tm = task.assignedTo ? teammateById.get(task.assignedTo) : null;
            const due = task.deadline ?? task.scheduledUntilDate ?? task.scheduledDate;
            const group = STATUS_ORDER[task.status] ?? 9;
            const header = showGroups && group !== lastGroup;
            if (header) lastGroup = group;
            return (
              <li key={task.id}>
                {header && (
                  <div className="v2-mct-group" data-tone={STATUS_TONES[task.status] ?? 'mute'}>
                    <span className="v2-mct-group-dot" aria-hidden="true" />
                    {t(`status.${task.status}`)}
                  </div>
                )}
                <button
                  type="button"
                  className={`v2-mct-row${idx === activeIdx ? ' is-kbd-active' : ''}`}
                  data-idx={idx}
                  onClick={() => onOpen(task)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <span className="v2-mct-rail" style={{ background: railTone(task) }} aria-hidden="true" />
                  <span className="v2-mct-main">
                    <span className="v2-mct-title">{task.title}</span>
                    <span className="v2-mct-meta">
                      <span className="v2-mct-kind">{t(`kind.${task.kind}`)}</span>
                      {task.projectId && projectById.get(task.projectId) && (
                        <span className="v2-mct-proj">{projectById.get(task.projectId)}</span>
                      )}
                    </span>
                  </span>
                  <span className="v2-mct-assignee">
                    {tm ? (
                      <>
                        <span
                          className="v2-mct-avatar"
                          style={{ background: tm.avatarColor ?? 'var(--signature)' }}
                          aria-hidden="true"
                        >
                          {tm.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="v2-mct-assignee-name">{tm.displayName}</span>
                      </>
                    ) : (
                      <span className="v2-mct-dim">{t('table.unassigned')}</span>
                    )}
                  </span>
                  {!showGroups && (
                    <span className="v2-mct-status" data-tone={STATUS_TONES[task.status] ?? 'mute'}>
                      {t(`status.${task.status}`)}
                    </span>
                  )}
                  <span className="v2-mct-due">{due ? formatDay(due, locale) : '—'}</span>
                  <span className="v2-mct-hours">
                    {task.estimatedHours ? t('table.hoursShort', { count: task.estimatedHours }) : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <style>{`
        .v2-mct { padding: 18px 18px 14px; }
        .v2-mct-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding: 2px 6px 14px;
          border-bottom: 1px solid var(--rule, rgba(255,255,255,0.07));
          margin-bottom: 6px;
        }
        .v2-mct-search {
          flex: 0 1 220px;
          min-width: 150px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--rule, rgba(255,255,255,0.1));
          border-radius: 10px;
          padding: 7px 12px;
          color: var(--txt-pure);
          font-size: 13px;
          outline: none;
          transition: border-color var(--dur-base, 0.18s) ease;
        }
        .v2-mct-search:focus { border-color: rgba(var(--signature-rgb), 0.5); }
        .v2-mct-search::placeholder { color: var(--txt-faint); }
        .v2-mct-toolbar-filters {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          flex: 1;
        }
        .v2-mct-sort {
          all: unset;
          cursor: pointer;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
          padding: 6px 10px;
          border: 1px solid var(--rule, rgba(255,255,255,0.08));
          border-radius: 999px;
          transition: color var(--dur-base, 0.18s) ease, border-color var(--dur-base, 0.18s) ease;
        }
        .v2-mct-sort:hover { color: var(--txt-muted); }
        .v2-mct-sort[data-active="true"] { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.4); }
        .v2-mct-clear {
          all: unset;
          cursor: pointer;
          color: var(--signature);
          font-size: 12px;
          font-weight: 600;
          padding: 4px 6px;
        }
        .v2-mct-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          margin-left: auto;
          white-space: nowrap;
        }

        .v2-mct-list { list-style: none; margin: 0; padding: 0; }
        .v2-mct-group {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--txt-faint);
          padding: 16px 8px 8px;
        }
        .v2-mct-group-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.6; }
        .v2-mct-group[data-tone='info'] { color: var(--signature); }
        .v2-mct-group[data-tone='warn'] { color: var(--warning); }
        .v2-mct-group[data-tone='crit'] { color: var(--danger); }
        .v2-mct-group[data-tone='ok']   { color: var(--success); }

        .v2-mct-row {
          all: unset;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 3px minmax(220px, 1fr) 150px auto 92px 48px;
          align-items: center;
          gap: 14px;
          width: 100%;
          padding: 9px 10px 9px 6px;
          border-radius: 10px;
          cursor: pointer;
          transition: background var(--dur-base, 0.18s) ease;
        }
        .v2-mct-row:hover, .v2-mct-row.is-kbd-active { background: rgba(255,255,255,0.035); }
        .v2-mct-row.is-kbd-active { box-shadow: inset 2px 0 0 var(--signature); }
        .v2-mct-rail { width: 3px; height: 26px; border-radius: 2px; }
        .v2-mct-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .v2-mct-title {
          color: var(--txt-pure);
          font-size: 13.5px;
          font-weight: 550;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-mct-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .v2-mct-kind {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-mct-proj {
          font-size: 11px;
          color: var(--txt-faint);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-mct-proj::before { content: '·'; margin-right: 8px; }
        .v2-mct-assignee { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .v2-mct-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: rgba(0,0,0,0.65);
        }
        .v2-mct-assignee-name {
          font-size: 12.5px;
          color: var(--txt-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-mct-dim { font-size: 12px; color: var(--txt-faint); }
        .v2-mct-status {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--rule, rgba(255,255,255,0.1));
          color: var(--txt-faint);
          white-space: nowrap;
          justify-self: start;
        }
        .v2-mct-status[data-tone='info'] { border-color: rgba(var(--signature-rgb), 0.4); color: var(--signature); }
        .v2-mct-status[data-tone='warn'] { border-color: rgba(245,158,11,0.45); color: var(--warning); }
        .v2-mct-status[data-tone='crit'] { border-color: rgba(239,68,68,0.45); color: var(--danger); }
        .v2-mct-status[data-tone='ok']   { border-color: rgba(34,197,94,0.4); color: var(--success); }
        .v2-mct-due, .v2-mct-hours {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          text-align: right;
        }

        @media (max-width: 760px) {
          .v2-mct { padding: 14px 12px 10px; }
          .v2-mct-row { grid-template-columns: 3px minmax(0, 1fr) auto; }
          .v2-mct-assignee-name, .v2-mct-due, .v2-mct-hours { display: none; }
          .v2-mct-status { display: none; }
        }
      `}</style>
    </section>
  );
}
