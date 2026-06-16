'use client';

import { useMemo, useState } from 'react';
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

// DISPATCH FLOOR — the surface where the owner runs the team.
//
//   NEEDS YOU   judgment calls Recgon can't make alone (reschedule / overdue /
//               awaiting review). Triaged work is NOT here — it lives in the
//               queue, where it can actually be assigned, flagged with the
//               reason Recgon couldn't auto-route it.
//   QUEUE       the dispatch backlog: unassigned work waiting for a person.
//   ROSTER      every teammate as a pod — load vs capacity, what they're on,
//               and what they're good at — so "who should this go to" is
//               answerable at a glance.
//   ALL TASKS   the full team table, demoted to a reference drawer.

const LIVE = ['assigned', 'accepted', 'in_progress', 'awaiting_review'];
const LIVE_SET = new Set(LIVE);
// Active work reads top-to-bottom the way a PM scans a person's plate.
const LIVE_ORDER: Record<string, number> = {
  in_progress: 0,
  accepted: 1,
  assigned: 2,
  awaiting_review: 3,
};

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

  const tasks = data.tasks;
  const teammates = data.teammates;

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Queue = unassigned backlog; triaged (Recgon-flagged) float to the top.
  const queue = useMemo(() => {
    return tasks
      .filter((task) => task.status === 'unassigned')
      .sort(
        (a, b) =>
          Number(Boolean(b.triageNote)) - Number(Boolean(a.triageNote)) || b.priority - a.priority,
      );
  }, [tasks]);

  // Each teammate's live plate, in scan order.
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

  // NEEDS YOU = decisions minus triaged (triaged is assignable → it's in the queue).
  const stripDecisions = useMemo(() => {
    if (!isOwner || !data.decisions) return null;
    return { ...data.decisions, triaged: [] };
  }, [isOwner, data.decisions]);
  const stripCount = stripDecisions
    ? stripDecisions.rescheduleRequests.length + stripDecisions.overdue.length + stripDecisions.awaitingReview.length
    : 0;

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
      {/* NEEDS YOU */}
      {isOwner && stripDecisions && stripCount > 0 && (
        <section className="v2-floor-region">
          <div className="v2-floor-eyebrow">
            <span className="v2-floor-tick" data-tone="warn" />
            <span className="v2-floor-eyebrow-lab">{t('dispatch.needsYou')}</span>
            <span className="v2-floor-eyebrow-count" data-tone="warn">{stripCount}</span>
          </div>
          <DecisionStack
            compact
            decisions={stripDecisions}
            teammates={teammates}
            teamId={teamId}
            onChanged={onChanged}
          />
        </section>
      )}

      {/* QUEUE */}
      <section className="v2-floor-region">
        <div className="v2-floor-eyebrow">
          <span className="v2-floor-tick" data-tone="sig" />
          <span className="v2-floor-eyebrow-lab">{t('dispatch.queue.title')}</span>
          <span className="v2-floor-eyebrow-count">{queue.length}</span>
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

      {/* ROSTER */}
      <section className="v2-floor-region">
        <div className="v2-floor-eyebrow">
          <span className="v2-floor-tick" data-tone="sig" />
          <span className="v2-floor-eyebrow-lab">{t('dispatch.roster.title')}</span>
          <span className="v2-floor-eyebrow-count">{teammates.length}</span>
        </div>
        {teammates.length === 0 ? (
          <div className="glass-card v2-floor-empty">
            <EmptyState
              icon={<Users size={22} strokeWidth={1.8} />}
              title={t('dispatch.roster.empty')}
              description={t('dispatch.roster.emptyHint')}
            />
          </div>
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

      {/* ALL TASKS — reference drawer */}
      <details className="v2-floor-alltasks">
        <summary className="v2-floor-alltasks-summary">
          <span className="v2-floor-eyebrow-lab">{t('dispatch.allTasks.toggle')}</span>
          <span className="v2-floor-eyebrow-count">{tasks.length}</span>
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
        .v2-floor { display: flex; flex-direction: column; gap: 26px; }
        .v2-floor-region {
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: opsRise var(--dur-page, 0.5s) var(--ease-out, cubic-bezier(0.16,1,0.3,1)) both;
        }
        .v2-floor-region:nth-of-type(2) { animation-delay: 70ms; }
        .v2-floor-region:nth-of-type(3) { animation-delay: 140ms; }

        /* Region eyebrow (matched to the console header's mono labels) */
        .v2-floor-eyebrow { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
        .v2-floor-tick { width: 3px; height: 13px; border-radius: 2px; background: var(--signature); }
        .v2-floor-tick[data-tone='warn'] { background: var(--warning); }
        .v2-floor-eyebrow-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 1.4px;
          text-transform: uppercase; color: var(--txt-muted);
        }
        .v2-floor-eyebrow-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          border: 1px solid var(--rule); border-radius: 999px;
          min-width: 20px; height: 18px; display: inline-flex;
          align-items: center; justify-content: center; padding: 0 6px;
        }
        .v2-floor-eyebrow-count[data-tone='warn'] { color: var(--warning); border-color: rgba(var(--warning-rgb), 0.4); }

        /* ── Queue ─────────────────────────────────────────────────────── */
        .v2-dq { padding: 8px 20px 12px; }
        .v2-dq-head {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 4px 8px;
        }
        .v2-dq-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
        }
        .v2-dq-empty { padding: 8px 4px 12px; }
        .v2-dq-list { list-style: none; margin: 0; padding: 0; }
        .v2-dq-row {
          display: flex; align-items: center; gap: 14px;
          padding: 9px 4px; border-top: 1px solid var(--rule);
        }
        .v2-dq-row:first-child { border-top: none; }
        .v2-dq-main {
          flex: 1 1 auto; min-width: 0;
          display: flex; align-items: center; gap: 11px;
          background: transparent; border: none; padding: 4px 2px;
          text-align: left; cursor: pointer; color: inherit;
          border-radius: 8px; transition: background var(--dur-fast, 0.15s) ease;
        }
        .v2-dq-main:hover { background: rgba(var(--signature-rgb), 0.05); }
        .v2-dq-prio { width: 7px; height: 7px; border-radius: 50%; background: var(--txt-faint); flex-shrink: 0; }
        .v2-dq-prio[data-prio='3'] { background: var(--danger); }
        .v2-dq-prio[data-prio='2'] { background: var(--signature); }
        .v2-dq-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .v2-dq-title {
          color: var(--txt-pure); font-size: 13px; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
        }
        .v2-dq-meta {
          font-size: 11px; color: var(--txt-faint);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .v2-dq-kind { text-transform: uppercase; letter-spacing: 0.4px; }
        .v2-dq-reason { color: var(--warning); }
        .v2-dq-assign { flex-shrink: 0; }

        /* ── Roster ────────────────────────────────────────────────────── */
        .v2-floor-roster {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(264px, 1fr));
          gap: 14px;
        }
        .v2-floor-empty { padding: 24px; }

        .v2-pod {
          display: flex; flex-direction: column; gap: 13px;
          padding: 16px 16px 14px;
          border: 1px solid var(--rule);
          border-radius: 14px;
          background: var(--bg-content);
          transition: border-color var(--dur-base, 0.2s) ease, transform var(--dur-base, 0.2s) ease;
        }
        .v2-pod:hover { transform: translateY(-1px); border-color: var(--rule-strong); }
        .v2-pod[data-state='over'] { border-color: rgba(var(--danger-rgb), 0.32); }
        .v2-pod[data-state='idle'] { border-style: dashed; }

        .v2-pod-head { display: flex; align-items: center; gap: 10px; }
        .v2-pod-id { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px; }
        .v2-pod-name {
          color: var(--txt-pure); font-size: 13.5px; font-weight: 650;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .v2-pod-stars {
          display: inline-flex; align-items: center; gap: 3px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 600; color: var(--warning);
          font-variant-numeric: tabular-nums;
        }
        .v2-pod-state {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;
          padding: 2px 7px; border-radius: 999px; flex-shrink: 0;
        }
        .v2-pod-state[data-state='over'] { color: var(--danger); background: rgba(var(--danger-rgb), 0.1); }
        .v2-pod-state[data-state='idle'] { color: var(--txt-faint); background: rgba(0,0,0,0.04); }

        .v2-pod-load { display: flex; flex-direction: column; gap: 6px; }
        .v2-pod-load-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .v2-pod-load-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px; font-weight: 700; letter-spacing: 0.8px;
          text-transform: uppercase; color: var(--txt-faint);
        }
        .v2-pod-load-val {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; font-weight: 600; color: var(--txt-muted);
          font-variant-numeric: tabular-nums;
        }
        .v2-pod-load-val[data-load='high'] { color: var(--danger); }
        .v2-pod-load-val[data-load='med'] { color: var(--warning); }
        .v2-pod-load-val[data-load='low'] { color: var(--success); }
        .v2-pod-load-val[data-load='idle'] { color: var(--txt-faint); }
        .v2-pod-load-track {
          height: 5px; border-radius: 3px; overflow: hidden;
          background: rgba(var(--signature-rgb), 0.07);
          border: 1px solid rgba(var(--signature-rgb), 0.05);
        }
        .v2-pod-load-fill {
          height: 100%; border-radius: 3px; background: var(--success);
          transition: width var(--dur-page, 0.5s) cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .v2-pod-load-fill[data-load='high'] { background: linear-gradient(90deg, var(--danger), rgba(var(--danger-rgb), 0.8)); box-shadow: 0 0 4px rgba(var(--danger-rgb), 0.4); }
        .v2-pod-load-fill[data-load='med'] { background: linear-gradient(90deg, var(--warning), rgba(var(--warning-rgb), 0.85)); }
        .v2-pod-load-fill[data-load='idle'] { background: var(--txt-faint); opacity: 0.4; }

        .v2-pod-live { display: flex; flex-direction: column; gap: 5px; }
        .v2-pod-empty {
          font-size: 11px; color: var(--txt-faint); font-style: italic; padding: 2px 0;
        }
        .v2-pod-chip {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 9px; border-radius: 8px;
          background: rgba(0,0,0,0.03); border: 1px solid var(--rule);
          cursor: pointer; text-align: left; width: 100%;
          transition: background var(--dur-fast, 0.15s) ease, border-color var(--dur-fast, 0.15s) ease;
        }
        .v2-pod-chip:hover { background: rgba(var(--signature-rgb), 0.06); border-color: rgba(var(--signature-rgb), 0.2); }
        .v2-pod-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--txt-faint); flex-shrink: 0; }
        .v2-pod-chip-dot[data-tone='crit'] { background: var(--danger); }
        .v2-pod-chip-dot[data-tone='warn'] { background: var(--warning); }
        .v2-pod-chip-dot[data-tone='sig'] { background: var(--signature); }
        .v2-pod-chip-title {
          flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--txt-muted);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .v2-pod-chip-h {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; color: var(--txt-faint); flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        .v2-pod-skills { display: flex; flex-wrap: wrap; gap: 5px; }
        .v2-pod-skill {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase;
          color: var(--txt-faint); padding: 2px 7px; border-radius: 5px;
          border: 1px solid var(--rule); background: rgba(0,0,0,0.02);
        }

        /* ── All-tasks drawer ──────────────────────────────────────────── */
        .v2-floor-alltasks { animation: opsRise var(--dur-page, 0.5s) var(--ease-out, cubic-bezier(0.16,1,0.3,1)) both; animation-delay: 200ms; }
        .v2-floor-alltasks-summary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 8px 6px; cursor: pointer; list-style: none; user-select: none;
        }
        .v2-floor-alltasks-summary::-webkit-details-marker { display: none; }
        .v2-floor-alltasks-summary::before {
          content: '▸'; color: var(--txt-faint); font-size: 11px;
          transition: transform var(--dur-fast, 0.15s) ease;
        }
        .v2-floor-alltasks[open] .v2-floor-alltasks-summary::before { transform: rotate(90deg); }
        .v2-floor-alltasks-body { margin-top: 12px; }

        @media (max-width: 860px) {
          .v2-floor { gap: 18px; }
          .v2-floor-roster { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .v2-floor-region, .v2-floor-alltasks { animation: none; }
        }
      `}</style>
    </div>
  );
}
