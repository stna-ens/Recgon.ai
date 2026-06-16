'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { EmptyState } from '@/components/ui';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask } from '@/lib/recgon/types';
import DecisionStack from './DecisionStack';
import DispatchQueue from './DispatchQueue';
import TeammatePod from './TeammatePod';
import TeamTaskTable from './TeamTaskTable';
import type { CommandResponse, CommandTask } from './types';

// DISPATCH FLOOR — where the owner runs the team. Calm, light, airy sections
// (the tasks-board / team-page house style), each a section-head + content.
// EVERY action stays on this page — review/verify/reassign go through the
// on-page detail panel, never a redirect.
//
//   NEEDS YOU   judgment calls (reschedule / overdue / awaiting review).
//   QUEUE       the dispatch backlog: unassigned work, assigned inline.
//   ROSTER      teammates as calm pods: load vs capacity + their live plate.
//   ALL TASKS   the full table, in a reference drawer.

const LIVE_SET = new Set(['assigned', 'accepted', 'in_progress', 'awaiting_review']);
const LIVE_ORDER: Record<string, number> = { in_progress: 0, accepted: 1, assigned: 2, awaiting_review: 3 };

export interface DispatchFloorProps {
  data: CommandResponse;
  teamId: string;
  currentTeammateId: string | null;
  isOwner: boolean;
  onChanged: () => void;
}

export default function DispatchFloor({ data, teamId, currentTeammateId, isOwner, onChanged }: DispatchFloorProps) {
  const t = useTranslations('command');
  const { addToast } = useToast();
  const searchParams = useSearchParams();

  const tasks = data.tasks;
  const teammates = data.teammates;

  // Deep link: /command?task=<id> opens the detail panel. Resolved at mount.
  const [openTaskId, setOpenTaskId] = useState<string | null>(() => {
    const want = searchParams.get('task');
    return want && tasks.some((task) => task.id === want) ? want : null;
  });
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const queue = useMemo(
    () =>
      tasks
        .filter((task) => task.status === 'unassigned')
        .sort(
          (a, b) =>
            Number(Boolean(b.triageNote)) - Number(Boolean(a.triageNote)) || b.priority - a.priority,
        ),
    [tasks],
  );

  const liveByTeammate = useMemo(() => {
    const map = new Map<string, CommandTask[]>();
    for (const task of tasks) {
      if (!task.assignedTo || !LIVE_SET.has(task.status)) continue;
      const list = map.get(task.assignedTo) ?? [];
      list.push(task);
      map.set(task.assignedTo, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (b.overdueTier ?? 0) - (a.overdueTier ?? 0) ||
          (LIVE_ORDER[a.status] ?? 9) - (LIVE_ORDER[b.status] ?? 9),
      );
    }
    return map;
  }, [tasks]);

  // NEEDS YOU = decisions minus triaged (triaged is assignable → it's the queue).
  const stripDecisions = useMemo(() => {
    if (!isOwner || !data.decisions) return null;
    return { ...data.decisions, triaged: [] };
  }, [isOwner, data.decisions]);
  const stripCount = stripDecisions
    ? stripDecisions.rescheduleRequests.length + stripDecisions.overdue.length + stripDecisions.awaitingReview.length
    : 0;
  const showNeedsYou = Boolean(stripDecisions && stripCount > 0);

  const assign = async (taskId: string, teammateId: string) => {
    if (!teammateId || busy[taskId]) return;
    setBusy((b) => ({ ...b, [taskId]: true }));
    try {
      const res = await fetch(`/api/recgon/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId: teammateId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = teammates.find((tm) => tm.id === teammateId)?.displayName ?? '';
      addToast(t('dispatch.queue.assignedTo', { name }), 'success');
      onChanged();
    } catch {
      addToast(t('dispatch.queue.assignFailed'), 'error');
    } finally {
      setBusy((b) => ({ ...b, [taskId]: false }));
    }
  };

  const openTask = openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null;

  return (
    <div className="v2-floor">
      {showNeedsYou && stripDecisions && (
        <section className="v2-floor-sec">
          <div className="v2-floor-head">
            <span className="recgon-label">{t('dispatch.needsYou')}</span>
            <span className="v2-floor-count">{stripCount}</span>
          </div>
          <DecisionStack
            decisions={stripDecisions}
            teammates={teammates}
            teamId={teamId}
            onChanged={onChanged}
            onOpenReview={setOpenTaskId}
          />
        </section>
      )}

      <section className="v2-floor-sec">
        <div className="v2-floor-head">
          <span className="recgon-label">{t('dispatch.queue.title')}</span>
          <span className="v2-floor-count">{queue.length}</span>
        </div>
        <DispatchQueue
          tasks={queue}
          teammates={teammates}
          isOwner={isOwner}
          busy={busy}
          onAssign={assign}
          onOpenTask={setOpenTaskId}
        />
      </section>

      <section className="v2-floor-sec">
        <div className="v2-floor-head">
          <span className="recgon-label">{t('dispatch.roster.title')}</span>
          <span className="v2-floor-count">{teammates.length}</span>
        </div>
        {teammates.length === 0 ? (
          <EmptyState
            icon={<Users size={22} strokeWidth={1.8} />}
            title={t('dispatch.roster.empty')}
            description={t('dispatch.roster.emptyHint')}
          />
        ) : (
          <div className="v2-floor-roster">
            {teammates.map((tm) => (
              <TeammatePod
                key={tm.id}
                teammate={tm}
                liveTasks={liveByTeammate.get(tm.id) ?? []}
                onOpenTask={setOpenTaskId}
              />
            ))}
          </div>
        )}
      </section>

      <details className="v2-floor-alltasks">
        <summary className="v2-floor-alltasks-summary">
          <span className="recgon-label">{t('dispatch.allTasks.toggle')}</span>
          <span className="v2-floor-count">{tasks.length}</span>
        </summary>
        <div className="v2-floor-alltasks-body">
          <TeamTaskTable
            tasks={tasks}
            teammates={teammates}
            projects={data.projects}
            view="all"
            currentTeammateId={currentTeammateId}
            shortcutsEnabled={openTaskId == null}
          />
        </div>
      </details>

      <TaskDetailPanel
        task={openTask ? (openTask as unknown as AgentTask) : null}
        isOpen={openTaskId != null}
        currentTeammateId={currentTeammateId}
        isOwner={isOwner}
        onClose={() => setOpenTaskId(null)}
        onRefresh={onChanged}
      />

      <style>{`
        .v2-floor { display: flex; flex-direction: column; gap: 34px; }
        .v2-floor-sec { display: flex; flex-direction: column; gap: 14px; }
        .v2-floor-head { display: flex; align-items: center; gap: 10px; }
        .v2-floor-head .recgon-label { margin-bottom: 0; }
        .v2-floor-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          border: 1px solid var(--rule); border-radius: 999px;
          min-width: 22px; text-align: center; padding: 1px 8px;
        }

        /* ── Roster pods (calm tasks-card) ─────────────────────────────── */
        .v2-floor-roster {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
          gap: 14px;
        }
        .v2-pod {
          display: flex; flex-direction: column; gap: 9px;
          background: var(--glass-substrate);
          border: 1px solid var(--rule);
          border-radius: var(--r-sm, 14px);
          padding: 14px 15px;
          box-shadow: var(--shadow-float);
          transition: border-color var(--dur-base, 0.22s) var(--ease-out, cubic-bezier(0.16,1,0.3,1));
        }
        .v2-pod:hover { border-color: rgba(var(--signature-rgb), 0.35); }
        .v2-pod-head { display: flex; align-items: center; gap: 9px; }
        .v2-pod-name {
          flex: 1 1 auto; min-width: 0;
          font-size: 13px; font-weight: 600; color: var(--txt-pure); letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .v2-pod-load-pct {
          flex-shrink: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; font-weight: 700; color: var(--txt-muted);
          font-variant-numeric: tabular-nums;
        }
        .v2-pod-load-pct[data-over='true'] { color: var(--danger); }
        .v2-pod-load-pct[data-idle='true'] {
          color: var(--txt-faint); font-weight: 600; font-size: 10px;
          letter-spacing: 0.5px; text-transform: uppercase;
        }
        .v2-pod-bar { height: 3px; border-radius: 2px; background: var(--rule); overflow: hidden; }
        .v2-pod-bar-fill {
          height: 100%; border-radius: 2px;
          background: rgba(var(--signature-rgb), 0.55);
          transition: width var(--dur-page, 0.5s) cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .v2-pod-bar-fill[data-over='true'] { background: var(--danger); }
        .v2-pod-hrs {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; color: var(--txt-faint); font-variant-numeric: tabular-nums;
        }
        .v2-pod-tasks { display: flex; flex-direction: column; gap: 5px; margin-top: 3px; }
        .v2-pod-free { font-size: 12px; color: var(--txt-faint); font-style: italic; }
        .v2-pod-task { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .v2-pod-task:focus-visible { outline: 2px solid var(--signature); outline-offset: 2px; border-radius: 3px; }
        .v2-pod-task-title {
          flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--txt-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: color var(--dur-fast, 0.15s) ease;
        }
        .v2-pod-task:hover .v2-pod-task-title { color: var(--signature); }
        .v2-pod-task-h {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; color: var(--txt-faint); flex-shrink: 0; font-variant-numeric: tabular-nums;
        }
        .v2-pod-more { font-size: 11px; color: var(--txt-faint); }
        .v2-pod-skills { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
        .v2-pod-skill {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase;
          color: var(--txt-muted); padding: 2px 8px; border: 1px solid var(--rule); border-radius: 999px;
        }

        /* ── Queue (calm tasks-card) ───────────────────────────────────── */
        .v2-dq-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
          gap: 12px;
        }
        .v2-dq-card {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          background: var(--glass-substrate);
          border: 1px solid var(--rule);
          border-radius: var(--r-sm, 14px);
          padding: 12px 14px;
          box-shadow: var(--shadow-float);
          transition: border-color var(--dur-base, 0.22s) var(--ease-out, cubic-bezier(0.16,1,0.3,1));
        }
        .v2-dq-card:hover { border-color: rgba(var(--signature-rgb), 0.30); }
        .v2-dq-main { all: unset; cursor: pointer; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .v2-dq-main:focus-visible { outline: 2px solid var(--signature); outline-offset: 2px; border-radius: 4px; }
        .v2-dq-kind {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--txt-faint);
        }
        .v2-dq-title {
          font-size: 13px; font-weight: 600; color: var(--txt-pure); letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: color var(--dur-fast, 0.15s) ease;
        }
        .v2-dq-main:hover .v2-dq-title { color: var(--signature); }
        .v2-dq-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .v2-dq-chip {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase;
          color: var(--txt-muted); padding: 2px 8px; border: 1px solid var(--rule); border-radius: 999px;
        }
        .v2-dq-reason { font-size: 11px; color: var(--txt-faint); font-style: italic; }
        .v2-dq-assign { flex-shrink: 0; }

        /* ── All-tasks drawer ──────────────────────────────────────────── */
        .v2-floor-alltasks-summary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 4px 0; cursor: pointer; list-style: none; user-select: none;
        }
        .v2-floor-alltasks-summary .recgon-label { margin-bottom: 0; }
        .v2-floor-alltasks-summary::-webkit-details-marker { display: none; }
        .v2-floor-alltasks-summary::before {
          content: '▸'; color: var(--txt-faint); font-size: 11px;
          transition: transform var(--dur-fast, 0.15s) ease;
        }
        .v2-floor-alltasks[open] .v2-floor-alltasks-summary::before { transform: rotate(90deg); }
        .v2-floor-alltasks-body { margin-top: 14px; }

        @media (max-width: 860px) {
          .v2-floor { gap: 28px; }
          .v2-floor-roster { grid-template-columns: 1fr; }
          .v2-dq-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
