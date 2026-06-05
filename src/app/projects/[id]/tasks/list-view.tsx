'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { useTranslations } from 'next-intl';
import { useConfirm } from '@/components/ui';
import { TaskStatusChip } from '@/components/TaskStatusChip';
import type { Teammate, VerificationEvidence, VerificationStatus } from '@/lib/recgon/types';

interface Task {
  id: string;
  teamId: string;
  projectId: string | null;
  title: string;
  description: string;
  kind: string;
  source: string;
  priority: number;
  status: 'unassigned' | 'assigned' | 'accepted' | 'in_progress' | 'awaiting_review' | 'done' | 'completed' | 'verified' | 'declined' | 'cancelled' | string;
  assignedTo: string | null;
  assignedAt: string | null;
  deadline: string | null;
  scheduledDate: string | null;
  scheduleNote: string | null;
  result: Record<string, unknown> | null;
  verificationStatus?: VerificationStatus;
  verificationEvidence?: VerificationEvidence | null;
}

type FilterKey = 'all' | 'needs_you' | 'in_progress' | 'in_review' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'needs_you', label: 'needs you' },
  { key: 'in_progress', label: 'in progress' },
  { key: 'in_review', label: 'in review' },
  { key: 'done', label: 'done' },
];

const KIND_LABEL: Record<string, string> = {
  next_step: 'next step',
  dev_prompt: 'dev',
  marketing: 'marketing',
  analytics: 'analytics',
  research: 'research',
  custom: 'task',
};

const LIVE = new Set(['unassigned', 'assigned', 'accepted', 'in_progress', 'awaiting_review']);
const DONE = new Set(['done', 'completed', 'verified']);

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function fmtSchedule(t: Pick<Task, 'scheduledDate' | 'deadline'>): string | null {
  if (t.scheduledDate) {
    const d = new Date(`${t.scheduledDate}T00:00:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (!t.deadline) return null;
  const due = new Date(t.deadline);
  return `due ${due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

function priorityChip(p: number): { label: string; color: string } | null {
  if (p <= 0) return { label: 'urgent', color: 'var(--danger)' };
  if (p === 1) return { label: 'high', color: 'var(--warning)' };
  return null;
}

function statusTone(t: Task): { label: string; color: string; glow: boolean } {
  if (t.verificationStatus === 'proof_requested' || t.verificationStatus === 'failed') {
    return { label: 'needs proof', color: 'var(--warning)', glow: true };
  }
  if (t.verificationStatus === 'auto_running' || t.verificationStatus === 'proof_evaluating') {
    return { label: 'verifying', color: 'var(--signature)', glow: true };
  }
  switch (t.status) {
    case 'awaiting_review': return { label: 'in review', color: 'var(--warning)', glow: true };
    case 'in_progress':     return { label: 'running', color: 'var(--signature)', glow: false };
    case 'accepted':        return { label: 'queued', color: 'var(--txt-muted)', glow: false };
    case 'assigned':        return { label: 'assigned', color: 'var(--txt-muted)', glow: false };
    case 'unassigned':      return { label: 'unassigned', color: 'var(--txt-faint)', glow: false };
    case 'done':
    case 'completed':
    case 'verified':        return { label: 'done', color: 'var(--success)', glow: false };
    default:                return { label: t.status, color: 'var(--txt-faint)', glow: false };
  }
}

function isAttention(t: Task): boolean {
  return (
    t.verificationStatus === 'proof_requested' ||
    t.verificationStatus === 'failed' ||
    t.status === 'assigned'
  );
}

function cleanText(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*\*/g, '').replace(/__/g, '');
}

export function ProjectTasksListView() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id;
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  // Same override/cancel flows as the calendar's TaskDetailPanel — reuse its strings.
  const tConfirm = useTranslations('calendar.confirm');
  const confirmDialog = useConfirm();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Project tasks + teammates come from SWR — cached across navigations, so
  // returning to this tab paints the last list instantly and revalidates in
  // the background (no skeleton). While a verification is mid-flight the task
  // hook polls every 1.5s via a dynamic refreshInterval (same cadence as the
  // old manual timer); otherwise polling is off. Focus revalidation is handled
  // by SWRConfig.
  const tasksKey = (teamId && projectId) ? `/api/teams/${teamId}/tasks?projectId=${projectId}` : null;
  const { data: tasksData, error: tasksError, mutate: mutateTasks } = useSWR<{ tasks?: Task[] }>(
    tasksKey,
    {
      refreshInterval: (latest) => {
        const list = Array.isArray(latest?.tasks) ? (latest!.tasks as Task[]) : [];
        const verifying = list.some(
          (t) => t.verificationStatus === 'auto_running' || t.verificationStatus === 'proof_evaluating',
        );
        return verifying ? 1500 : 0;
      },
    },
  );
  const teammatesKey = teamId ? `/api/teams/${teamId}/teammates` : null;
  const { data: teammatesData, mutate: mutateTeammates } = useSWR<{ teammates?: Teammate[] }>(teammatesKey);

  const tasks = useMemo<Task[]>(() => {
    const all: Task[] = Array.isArray(tasksData?.tasks) ? (tasksData!.tasks as Task[]) : [];
    // Defensive — server already filters by projectId, but keep a guard.
    return all.filter((t) => t.projectId === projectId);
  }, [tasksData, projectId]);
  const teammates = useMemo<Teammate[]>(
    () => (Array.isArray(teammatesData?.teammates) ? (teammatesData!.teammates as Teammate[]) : []),
    [teammatesData],
  );
  const loading = tasksKey != null && tasksData === undefined && !tasksError;

  // teammateId → teammate. Used by the row to render the assignee chip.
  const teammateById = useMemo(() => {
    const map = new Map<string, Teammate>();
    for (const tm of teammates) map.set(tm.id, tm);
    return map;
  }, [teammates]);

  // Re-pull tasks + teammates after a mutation (override / reassign / cancel).
  const refresh = useCallback(async () => {
    await Promise.all([mutateTasks(), mutateTeammates()]);
  }, [mutateTasks, mutateTeammates]);

  const counts = useMemo(() => ({
    all:         tasks.filter((t) => LIVE.has(t.status)).length,
    needs_you:   tasks.filter(isAttention).length,
    in_progress: tasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress').length,
    in_review:   tasks.filter((t) => t.status === 'awaiting_review').length,
    done:        tasks.filter((t) => DONE.has(t.status)).length,
  }), [tasks]);

  const filtered = useMemo(() => {
    const sorted = tasks.slice().sort((a, b) => {
      const aAtt = isAttention(a), bAtt = isAttention(b);
      if (aAtt !== bAtt) return aAtt ? -1 : 1;
      const aDate = a.assignedAt ?? '';
      const bDate = b.assignedAt ?? '';
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    let scoped: Task[];
    switch (filter) {
      case 'all':         scoped = sorted.filter((t) => LIVE.has(t.status)); break;
      case 'needs_you':   scoped = sorted.filter(isAttention); break;
      case 'in_progress': scoped = sorted.filter((t) => t.status === 'accepted' || t.status === 'in_progress'); break;
      case 'in_review':   scoped = sorted.filter((t) => t.status === 'awaiting_review'); break;
      case 'done':        scoped = sorted.filter((t) => DONE.has(t.status)); break;
      default:            scoped = sorted; break;
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((t) => {
      const title = (t.title ?? '').toLowerCase();
      const desc = (t.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [tasks, filter, searchQuery]);

  // Visual split for the `all` filter: open (needs decision) → in progress
  // (actively working) → in review (mentor judging). Each bucket only renders
  // when populated, so empty workflows stay quiet.
  const grouped = useMemo(() => {
    if (filter !== 'all') return null;
    const open = filtered.filter((t) => t.status === 'unassigned' || t.status === 'assigned');
    const inProgress = filtered.filter((t) => t.status === 'accepted' || t.status === 'in_progress');
    const review = filtered.filter((t) => t.status === 'awaiting_review');
    return { open, inProgress, review };
  }, [filter, filtered]);

  const headline = useMemo(() => {
    if (loading) return 'loading';
    if (filtered.length === 0) {
      if (filter === 'needs_you')   return 'all clear.';
      if (filter === 'in_progress') return 'nothing in flight.';
      if (filter === 'done')        return 'nothing shipped yet.';
      return 'nothing here.';
    }
    if (filter === 'needs_you')   return `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'} for you.`;
    if (filter === 'in_progress') return `${filtered.length} in flight.`;
    if (filter === 'in_review')   return `${filtered.length} in review.`;
    if (filter === 'done')        return `${filtered.length} shipped.`;
    return `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}.`;
  }, [loading, filter, filtered.length]);

  // Owner override — bypass verification, mark complete. Used when a task is
  // stuck in proof or sitting in awaiting_review. Confirms first because it
  // skips the audit trail the verifier would normally produce.
  const overrideTask = useCallback(async (task: Task) => {
    if (working) return;
    if (!(await confirmDialog({
      title: tConfirm('overrideTitle'),
      description: tConfirm('overrideBody'),
      destructive: true,
    }))) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/override`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'override failed');
      }
      addToast('marked complete (override)', 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'override failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, confirmDialog, tConfirm, refresh]);

  // Owner reassign — uses the /decline endpoint which unassigns and
  // re-dispatches via Recgon's matcher. Equivalent owner-side action.
  const reassignTask = useCallback(async (task: Task) => {
    if (working) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}/decline`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'reassign failed');
      }
      const { reassignedTo, ownerFallback } = await res.json().catch(() => ({}));
      addToast(
        ownerFallback
          ? 'no other match — sent to you'
          : reassignedTo
            ? 'recgon reassigned'
            : 'recgon will reassign',
        'success',
      );
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'reassign failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, refresh]);

  // Owner cancel — keeps the task in history but stops execution.
  const cancelTask = useCallback(async (task: Task) => {
    if (working) return;
    if (!(await confirmDialog({
      title: tConfirm('cancelTitle'),
      description: tConfirm('cancelBody'),
      confirmLabel: tConfirm('cancelConfirmLabel'),
      cancelLabel: tConfirm('keepTask'),
      destructive: true,
    }))) return;
    setWorking(task.id);
    try {
      const res = await fetch(`/api/teams/${task.teamId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'cancel failed');
      }
      addToast('task cancelled', 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'cancel failed', 'error');
    } finally {
      setWorking(null);
    }
  }, [working, addToast, confirmDialog, tConfirm, refresh]);

  // Render a single task as a 2-line dossier: title + muted meta on the left,
  // assignee chip + owner action on the right edge. The owner does NOT act
  // on behalf of the assignee — accept / mark done / submit proof live in
  // the assignee's own inbox. The right edge here surfaces only owner moves:
  // `verify` (override-complete) for stuck tasks, status text otherwise.
  const renderRow = (t: Task, _idx: number) => {
    const tone = statusTone(t);
    const chip = priorityChip(t.priority);
    const isExpanded = expanded === t.id;
    const isWorking = working === t.id;
    const isAssigned = t.status === 'assigned';
    const needsProof = t.verificationStatus === 'proof_requested' || t.verificationStatus === 'failed';
    const canVerify = t.status === 'awaiting_review' || needsProof;
    const isOpen = LIVE.has(t.status);
    const schedule = fmtSchedule(t);
    const time = relTime(t.assignedAt);
    const assignee = t.assignedTo ? teammateById.get(t.assignedTo) : undefined;

    // Only the rows that block the owner pick up a left-edge accent. Verifying
    // and in-review rows already pulse on the right; they don't need the bar.
    const attention = needsProof ? 'proof' : isAssigned ? 'assigned' : undefined;

    return (
      <li key={t.id} className="v2-tasks-row-wrap">
        <div
          className="v2-tasks-row"
          data-attention={attention}
          onClick={() => setExpanded(isExpanded ? null : t.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(isExpanded ? null : t.id); }}
        >
          <div className="v2-tasks-row__main">
            <div className="v2-tasks-row__title-line">
              {chip && (
                <span className="v2-tasks-prio" style={{ color: chip.color, borderColor: chip.color }}>
                  {chip.label}
                </span>
              )}
              <span className="v2-tasks-row__title">{cleanText(t.title)}</span>
            </div>
            <div className="v2-tasks-row__meta">
              <span>{KIND_LABEL[t.kind] ?? t.kind}</span>
              {time && (
                <>
                  <span className="v2-tasks-meta-sep" aria-hidden>·</span>
                  <span>{time}</span>
                </>
              )}
              {schedule && (
                <>
                  <span className="v2-tasks-meta-sep" aria-hidden>·</span>
                  <span className="v2-tasks-meta-sched" title={t.scheduleNote ?? undefined}>{schedule}</span>
                </>
              )}
            </div>
          </div>
          <div className="v2-tasks-row__right">
            <span
              className="v2-tasks-assignee"
              data-empty={assignee ? undefined : 'true'}
              title={assignee ? assignee.displayName : 'unassigned'}
            >
              <span
                className="v2-tasks-assignee-bubble"
                data-empty={assignee ? undefined : 'true'}
                style={assignee?.avatarColor ? { background: assignee.avatarColor } : undefined}
              >
                {assignee?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assignee.avatarUrl} alt="" />
                ) : assignee ? (assignee.displayName || '·').slice(0, 1).toUpperCase() : '·'}
              </span>
              <span className="v2-tasks-assignee-name">
                {assignee ? assignee.displayName : 'unassigned'}
              </span>
            </span>
            {canVerify ? (
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={(e) => { e.stopPropagation(); overrideTask(t); }}
                disabled={isWorking}
                title="Mark complete and bypass verification"
              >
                {isWorking ? <><span className="v2-inline-spinner" aria-hidden="true" />working…</> : 'verify'}
              </button>
            ) : (
              <span
                className={`v2-tasks-row__status ${tone.glow ? 'is-pulse' : ''}`}
                style={{ color: tone.color }}
              >
                {tone.label}
              </span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="v2-tasks-detail">
            <div className="v2-tasks-chiprow" onClick={(e) => e.stopPropagation()}>
              <TaskStatusChip
                status={t.status as Parameters<typeof TaskStatusChip>[0]['status']}
                verification={t.verificationStatus}
                evidence={t.verificationEvidence ?? null}
              />
            </div>

            {t.description && (
              <p className="v2-tasks-desc">{cleanText(t.description)}</p>
            )}

            {isOpen && (
              <div className="v2-tasks-actions" onClick={(e) => e.stopPropagation()}>
                {t.assignedTo && (
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost"
                    onClick={() => reassignTask(t)}
                    disabled={isWorking}
                    title="Unassign and let Recgon re-dispatch"
                  >
                    reassign
                  </button>
                )}
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost"
                  onClick={() => cancelTask(t)}
                  disabled={isWorking}
                >
                  cancel task
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="v2-tasks">
      <header className="v2-section-head">
        <div>
          <span className="recgon-label v2-eyebrow">› tasks</span>
          <h2 className="v2-section-title">
            <span className="v2-pink">{headline.split(' ')[0]}</span>{' '}{headline.split(' ').slice(1).join(' ')}
          </h2>
          <p className="v2-section-sub">
            Mentor-minted work for this project. Submit proof inline — no detours.
          </p>
        </div>
      </header>

      <div className="v2-tasks-controls">
        <nav className="v2-facets" aria-label="Task filters">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`v2-facet ${active ? 'is-active' : ''}`}
                aria-pressed={active}
              >
                <span className="v2-facet-label">{f.label}</span>
                {count > 0 && <span className="v2-facet-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="v2-tasks-search-wrap">
          <span className="v2-tasks-search-glyph" aria-hidden="true">›</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="filter tasks…"
            className="v2-tasks-search"
            aria-label="Filter tasks"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="v2-tasks-search-clear"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="glass-card is-static is-tight">
          {[1, 2, 3].map((i) => (
            <div key={i} className="v2-tasks-skel">
              <span className="v2-tasks-num">{`0${i}`}</span>
              <div className="v2-skel-bar" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card is-static is-roomy v2-tasks-empty">
          <p className="v2-tasks-empty-text">
            {filter === 'needs_you'
              ? 'No tasks waiting on you.'
              : filter === 'in_progress'
                ? 'Nothing in flight. Accept a task to get started.'
                : filter === 'in_review'
                  ? 'No tasks under review.'
                  : filter === 'done'
                    ? 'No tasks shipped yet.'
                    : 'No tasks for this project yet. The mentor mints tasks from analysis.'}
          </p>
        </div>
      ) : grouped ? (
        <div className="glass-card is-static is-tight v2-tasks-shell">
          {grouped.open.length > 0 && (
            <>
              <div className="v2-tasks-section">
                <span className="v2-tasks-section-label">Open · {grouped.open.length}</span>
                <span className="v2-tasks-section-line" aria-hidden="true" />
              </div>
              <ol>
                {grouped.open.map((t, i) => renderRow(t, i))}
              </ol>
            </>
          )}
          {grouped.inProgress.length > 0 && (
            <>
              <div className="v2-tasks-section">
                <span className="v2-tasks-section-label">Work in progress · {grouped.inProgress.length}</span>
                <span className="v2-tasks-section-line" aria-hidden="true" />
              </div>
              <ol>
                {grouped.inProgress.map((t, i) => renderRow(t, i))}
              </ol>
            </>
          )}
          {grouped.review.length > 0 && (
            <>
              <div className="v2-tasks-section">
                <span className="v2-tasks-section-label">In review · {grouped.review.length}</span>
                <span className="v2-tasks-section-line" aria-hidden="true" />
              </div>
              <ol>
                {grouped.review.map((t, i) => renderRow(t, i))}
              </ol>
            </>
          )}
        </div>
      ) : (
        <div className="glass-card is-static is-tight v2-tasks-shell">
          <ol>
            {filtered.map((t, i) => renderRow(t, i))}
          </ol>
        </div>
      )}

      <style>{`
        .v2-tasks {
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding-bottom: 32px;
          animation: v2pageFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2pageFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }

        .v2-section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 4px;
        }
        .v2-eyebrow { color: var(--signature); margin: 0 0 8px; }
        .v2-section-title {
          font-size: clamp(22px, 2.6vw, 28px);
          font-weight: 600;
          letter-spacing: -0.018em;
          color: var(--txt-pure);
          margin: 0;
          line-height: 1.2;
        }
        .v2-section-sub {
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--txt-muted);
          letter-spacing: 0.1px;
        }
        .v2-pink { color: var(--signature); }

        /* Controls bar — facets + search */
        .v2-tasks-controls {
          display: flex;
          gap: 14px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .v2-facets {
          display: inline-flex;
          gap: 0;
          padding: 4px;
          border: 1px solid var(--rule);
          border-radius: 9px;
          background: rgba(255,255,255,0.02);
        }
        .v2-facet {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 12px;
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--txt-muted);
          transition: color var(--dur-fast) ease, background var(--dur-fast) ease;
        }
        .v2-facet:hover { color: var(--txt-pure); }
        .v2-facet.is-active {
          background: var(--bg-card);
          color: var(--txt-pure);
          box-shadow: inset 0 0 0 1px var(--rule-strong);
        }
        .v2-facet-count {
          font-variant-numeric: tabular-nums;
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 999px;
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
          letter-spacing: 0;
        }
        .v2-facet.is-active .v2-facet-count {
          background: var(--signature);
          color: var(--bg-card);
        }

        .v2-tasks-search-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 220px;
          flex: 1 1 220px;
          max-width: 360px;
        }
        .v2-tasks-search-glyph {
          position: absolute;
          left: 10px;
          color: var(--signature);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          opacity: 0.6;
          pointer-events: none;
        }
        .v2-tasks-search {
          width: 100%;
          padding: 8px 30px 8px 26px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--rule);
          border-radius: 8px;
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.2px;
          outline: none;
          transition: border-color var(--dur-fast) ease;
        }
        .v2-tasks-search::placeholder { color: var(--txt-faint); }
        .v2-tasks-search:focus { border-color: rgba(var(--signature-rgb), 0.45); }
        .v2-tasks-search-clear {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: var(--txt-faint);
          font-size: 14px;
          cursor: pointer;
          padding: 2px 6px;
          line-height: 1;
        }
        .v2-tasks-search-clear:hover { color: var(--txt-pure); }

        /* Shell + section dividers */
        .v2-tasks-shell { padding: 4px 0; }
        .v2-tasks-shell ol { list-style: none; padding: 0; margin: 0; }
        .v2-tasks-section {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px 6px;
        }
        .v2-tasks-section-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-muted);
        }
        .v2-tasks-section-line {
          flex: 1;
          height: 1px;
          background: var(--rule);
        }

        .v2-tasks-row-wrap {
          border-bottom: 1px solid var(--rule);
        }
        .v2-tasks-row-wrap:last-child { border-bottom: none; }

        /* Dossier row — title + meta on the left, single primary action on the right.
           Left-edge accent only on rows that block the user. */
        .v2-tasks-row {
          position: relative;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 18px;
          padding: 16px 22px;
          cursor: pointer;
          transition: background var(--dur-fast) ease;
        }
        .v2-tasks-row:hover {
          background: rgba(var(--signature-rgb), 0.03);
        }
        .v2-tasks-row::before {
          content: '';
          position: absolute;
          left: 0;
          top: 14px;
          bottom: 14px;
          width: 2px;
          background: transparent;
          border-radius: 0 2px 2px 0;
          transition: background var(--dur-base) ease;
        }
        .v2-tasks-row[data-attention='proof']::before    { background: var(--warning); }
        .v2-tasks-row[data-attention='assigned']::before { background: var(--signature); }

        .v2-tasks-row__main { min-width: 0; }
        .v2-tasks-row__title-line {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .v2-tasks-row__title {
          font-size: 14px;
          font-weight: 500;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          flex: 1;
          min-width: 0;
        }
        .v2-tasks-row__meta {
          margin-top: 5px;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          letter-spacing: 0.35px;
          text-transform: uppercase;
          line-height: 1.1;
        }
        .v2-tasks-meta-sep   { opacity: 0.45; }
        .v2-tasks-meta-sched { color: var(--signature); opacity: 0.85; }

        .v2-tasks-row__right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .v2-tasks-row__status {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .v2-tasks-row__status.is-pulse { animation: v2statusPulse 1.6s ease-in-out infinite; }
        @keyframes v2statusPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }

        /* Assignee chip — bubble + name, sits next to the primary action. */
        .v2-tasks-assignee {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 10px 2px 2px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid var(--rule);
          flex-shrink: 0;
          max-width: 160px;
        }
        .v2-tasks-assignee[data-empty='true'] {
          border-style: dashed;
          background: transparent;
        }
        .v2-tasks-assignee-bubble {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(var(--signature-rgb), 0.55);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          color: white;
          overflow: hidden;
          flex-shrink: 0;
          line-height: 1;
        }
        .v2-tasks-assignee-bubble[data-empty='true'] {
          background: transparent;
          color: var(--txt-faint);
          border: 1px dashed var(--rule);
          width: 16px;
          height: 16px;
        }
        .v2-tasks-assignee-bubble img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .v2-tasks-assignee-name {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.2px;
          color: var(--txt-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .v2-tasks-assignee[data-empty='true'] .v2-tasks-assignee-name {
          color: var(--txt-faint);
          font-style: italic;
        }

        .v2-tasks-prio {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 2px 7px;
          border-radius: 999px;
          border: 1px solid;
          flex-shrink: 0;
        }

        /* Detail */
        .v2-tasks-detail {
          padding: 4px 22px 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: v2detailIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes v2detailIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .v2-tasks-chiprow { display: flex; }
        .v2-tasks-desc {
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--txt-muted);
          margin: 0;
          max-width: 760px;
        }
        .v2-tasks-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* Proof block */
        .v2-tasks-proof {
          margin-top: 6px;
          padding: 16px;
          border: 1px dashed rgba(255, 159, 10, 0.35);
          border-radius: 10px;
          background: rgba(255, 159, 10, 0.04);
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 760px;
        }
        .v2-tasks-proof-hint {
          margin: 0;
          font-size: 12.5px;
          color: var(--txt-muted);
          line-height: 1.55;
        }
        .v2-tasks-proof-foot {
          margin: 0;
          font-size: 11.5px;
          color: var(--txt-faint);
          line-height: 1.5;
        }
        .v2-tasks-proof-input {
          width: 100%;
          padding: 10px 12px;
          background: var(--bg-card);
          border: 1px solid var(--rule);
          border-radius: 8px;
          color: var(--txt-pure);
          font-family: inherit;
          font-size: 13px;
          line-height: 1.55;
          resize: vertical;
          outline: none;
          transition: border-color var(--dur-fast) ease;
        }
        .v2-tasks-proof-input:focus { border-color: rgba(var(--signature-rgb), 0.45); }
        .v2-tasks-proof-links {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
        }
        .v2-tasks-proof-actions {
          display: flex;
          justify-content: flex-end;
        }

        /* Buttons */
        .v2-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          cursor: pointer;
          text-decoration: none;
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease, background 180ms ease, border-color 180ms ease, color 180ms ease;
          border: 1px solid;
        }
        .v2-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; }
        .v2-btn-primary {
          background: var(--signature);
          border-color: var(--signature);
          color: white;
        }
        .v2-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px -6px rgba(var(--signature-rgb), 0.55);
        }
        .v2-btn-ghost {
          background: transparent;
          border-color: var(--rule);
          color: var(--txt-muted);
        }
        .v2-btn-ghost:hover:not(:disabled) {
          color: var(--txt-pure);
          border-color: var(--rule-strong);
        }
        .v2-btn-warn {
          background: rgba(255, 159, 10, 0.12);
          border-color: rgba(255, 159, 10, 0.45);
          color: var(--warning);
        }
        .v2-btn-warn:hover:not(:disabled) {
          background: rgba(255, 159, 10, 0.18);
          border-color: var(--warning);
          transform: translateY(-1px);
        }

        .v2-inline-spinner {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: white;
          animation: v2spin 700ms linear infinite;
          display: inline-block;
        }
        @keyframes v2spin { to { transform: rotate(360deg); } }

        .v2-tasks-skel {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 14px;
          padding: 14px 18px;
          align-items: center;
          border-bottom: 1px solid var(--rule);
        }
        .v2-skel-bar {
          height: 12px;
          background: rgba(var(--signature-rgb), 0.06);
          animation: v2skelPulse 1.6s ease-in-out infinite;
          border-radius: 4px;
        }
        @keyframes v2skelPulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.9; }
        }

        .v2-tasks-empty { text-align: center; }
        .v2-tasks-empty-text {
          font-size: 14px;
          color: var(--txt-muted);
          margin: 0;
        }

        @media (max-width: 720px) {
          .v2-tasks-row {
            padding: 14px 16px;
            gap: 12px;
          }
          .v2-tasks-row__meta { gap: 6px; font-size: 10px; }
          .v2-tasks-row__right { gap: 6px; }
          .v2-tasks-assignee {
            padding: 0;
            border: none;
            background: transparent;
          }
          .v2-tasks-assignee-name { display: none; }
          .v2-tasks-detail { padding: 4px 16px 16px 16px; }
          .v2-tasks-controls { gap: 10px; }
        }
      `}</style>
    </div>
  );
}
