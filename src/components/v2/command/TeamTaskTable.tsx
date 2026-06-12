'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Select from '@/components/Select';
import { EmptyState } from '@/components/ui';
import { formatDay } from '@/lib/datetime';
import { useListShortcuts } from '@/lib/useListShortcuts';
import type { CommandProject, CommandTask, CommandTeammate } from './types';

type T = ReturnType<typeof useTranslations<'command'>>;

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

// Active work first, then queued, then review, then terminal — the order a
// PM scans a board in.
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

const STATUSES = [
  'unassigned',
  'assigned',
  'accepted',
  'in_progress',
  'awaiting_review',
  'completed',
  'declined',
  'failed',
  'cancelled',
];
const KINDS = ['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom'];

type SortKey = 'default' | 'priority' | 'due';

export interface TeamTaskTableProps {
  tasks: CommandTask[];
  teammates: CommandTeammate[];
  projects: CommandProject[];
  onOpen: (task: CommandTask) => void;
  // False while the detail panel is open so j/k don't move under it.
  shortcutsEnabled?: boolean;
}

export default function TeamTaskTable({ tasks, teammates, projects, onOpen, shortcutsEnabled = true }: TeamTaskTableProps) {
  const t = useTranslations('command');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [assignee, setAssignee] = useState('all');
  const [project, setProject] = useState('all');
  const [priority, setPriority] = useState('all');
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

  const hasFilters =
    search.trim() !== '' ||
    status !== 'all' ||
    kind !== 'all' ||
    assignee !== 'all' ||
    project !== 'all' ||
    priority !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = tasks.filter((task) => {
      if (q && !task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) return false;
      if (status !== 'all' && task.status !== status) return false;
      if (kind !== 'all' && task.kind !== kind) return false;
      if (assignee !== 'all') {
        if (assignee === 'none' ? task.assignedTo !== null : task.assignedTo !== assignee) return false;
      }
      if (project !== 'all' && task.projectId !== project) return false;
      if (priority !== 'all' && String(task.priority) !== priority) return false;
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
      // Default: status group, then priority high→low, then newest.
      const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (so !== 0) return so;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, [tasks, search, status, kind, assignee, project, priority, sortKey, sortDir]);

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

  // Keep the keyboard-active row visible.
  useEffect(() => {
    if (activeIdx < 0) return;
    document
      .querySelector(`.v2-mc-row[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
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
    setStatus('all');
    setKind('all');
    setAssignee('all');
    setProject('all');
    setPriority('all');
  };

  const opt = (value: string, label: string) => ({ value, label });
  const allOpt = opt('all', t('table.filters.all'));

  return (
    <section className="v2-mc-table-sec" aria-label={t('table.heading')}>
      <div className="v2-mc-table-head">
        <h2 className="v2-mc-h2">{t('table.heading')}</h2>
        <span className="v2-mc-count">{t('table.count', { count: filtered.length })}</span>
      </div>

      <div className="v2-mc-filters">
        <input
          type="search"
          className="ui-input v2-mc-search"
          placeholder={t('table.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('table.search')}
        />
        <Select
          size="sm"
          value={status}
          onChange={setStatus}
          placeholder={t('table.filters.status')}
          options={[allOpt, ...STATUSES.map((s) => opt(s, t(`status.${s}`)))]}
        />
        <Select
          size="sm"
          value={kind}
          onChange={setKind}
          placeholder={t('table.filters.kind')}
          options={[allOpt, ...KINDS.map((k) => opt(k, t(`kind.${k}`)))]}
        />
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
        {projects.length > 0 && (
          <Select
            size="sm"
            value={project}
            onChange={setProject}
            placeholder={t('table.filters.project')}
            options={[allOpt, ...projects.map((p) => opt(p.id, p.name))]}
          />
        )}
        <Select
          size="sm"
          value={priority}
          onChange={setPriority}
          placeholder={t('table.filters.priority')}
          options={[allOpt, opt('3', t('priority.p3')), opt('2', t('priority.p2')), opt('1', t('priority.p1'))]}
        />
        {hasFilters && (
          <button type="button" className="v2-mc-clear" onClick={clearFilters}>
            {t('table.filters.clear')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('table.empty') : t('table.emptyTeam')}
        />
      ) : (
        <div className="v2-mc-table-wrap">
          <table className="v2-mc-table">
            <thead>
              <tr>
                <th>{t('table.columns.task')}</th>
                <th>{t('table.columns.project')}</th>
                <th>{t('table.columns.assignee')}</th>
                <th>{t('table.columns.status')}</th>
                <th>
                  <button type="button" className="v2-mc-sort" onClick={() => toggleSort('priority')} data-active={sortKey === 'priority'}>
                    {t('table.columns.priority')}
                    {sortKey === 'priority' && <span aria-hidden="true">{sortDir === -1 ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th>
                  <button type="button" className="v2-mc-sort" onClick={() => toggleSort('due')} data-active={sortKey === 'due'}>
                    {t('table.columns.due')}
                    {sortKey === 'due' && <span aria-hidden="true">{sortDir === -1 ? '↓' : '↑'}</span>}
                  </button>
                </th>
                <th>{t('table.columns.hours')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, idx) => {
                const tm = task.assignedTo ? teammateById.get(task.assignedTo) : null;
                const due = task.deadline ?? task.scheduledUntilDate ?? task.scheduledDate;
                return (
                  <tr
                    key={task.id}
                    className={`v2-mc-row${idx === activeIdx ? ' is-kbd-active' : ''}`}
                    data-idx={idx}
                    tabIndex={0}
                    onClick={() => onOpen(task)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(task);
                      }
                    }}
                  >
                    <td className="v2-mc-cell-task">
                      <span className="v2-mc-task-title">{task.title}</span>
                      <span className="v2-mc-kind">{t(`kind.${task.kind}`)}</span>
                    </td>
                    <td className="v2-mc-cell-mute">
                      {task.projectId ? projectById.get(task.projectId) ?? '—' : '—'}
                    </td>
                    <td>
                      {tm ? (
                        <span className="v2-mc-assignee">
                          <span
                            className="v2-mc-avatar-dot"
                            style={{ background: tm.avatarColor ?? 'var(--signature)' }}
                            aria-hidden="true"
                          />
                          {tm.displayName}
                        </span>
                      ) : (
                        <span className="v2-mc-cell-mute">{t('table.unassigned')}</span>
                      )}
                    </td>
                    <td>
                      <span className="v2-mc-status" data-tone={STATUS_TONES[task.status] ?? 'mute'}>
                        {t(`status.${task.status}`)}
                      </span>
                    </td>
                    <td>
                      <span className="v2-mc-prio" data-prio={task.priority}>
                        {t(`priority.p${Math.min(Math.max(task.priority, 1), 3)}`)}
                      </span>
                    </td>
                    <td className="v2-mc-cell-mute">{due ? formatDay(due, locale) : '—'}</td>
                    <td className="v2-mc-cell-mute">
                      {task.estimatedHours ? t('table.hoursShort', { count: task.estimatedHours }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
