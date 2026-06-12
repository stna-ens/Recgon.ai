'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Skeleton } from '@/components/ui';
import TeamTaskTable from '@/components/v2/command/TeamTaskTable';
import DecisionStack from '@/components/v2/command/DecisionStack';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask } from '@/lib/recgon/types';
import type { CommandResponse, CommandTask } from '@/components/v2/command/types';

// Mission Control — the team-wide task picture in one screen.
//
// Layout (the Phase 3.5 lesson, encoded): the owner's "needs decision"
// stack comes FIRST and answers "what is blocking this team right now";
// the full filterable table is the secondary surface. No workload
// swimlanes.

const ACTIVE = new Set(['assigned', 'accepted', 'in_progress']);

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function CommandPageInner() {
  const t = useTranslations('command');
  const { currentTeam } = useTeam();
  const { data: session } = useSession();
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = currentTeam?.id ?? null;

  const { data, error, mutate } = useSWR<CommandResponse>(
    teamId ? `/api/teams/${teamId}/command` : null,
    fetcher,
    { refreshInterval: 30_000 },
  );

  useEffect(() => {
    if (error) addToast(t('loadFailed'), 'error');
  }, [error, addToast, t]);

  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const loading = teamId != null && data === undefined && !error;

  const stats = useMemo(() => {
    let active = 0;
    let queued = 0;
    let review = 0;
    let overdue = 0;
    for (const task of tasks) {
      if (ACTIVE.has(task.status)) active += 1;
      if (task.status === 'unassigned') queued += 1;
      if (task.status === 'awaiting_review') review += 1;
      if ((task.overdueTier ?? 0) > 0 && ACTIVE.has(task.status)) overdue += 1;
    }
    return { active, queued, review, overdue };
  }, [tasks]);

  // ── Detail panel + ?task= deep link ───────────────────────────────────────
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Adopt the deep link once data is in (so a shared /command?task=ID URL
  // opens straight onto the panel).
  useEffect(() => {
    const fromUrl = searchParams.get('task');
    if (fromUrl && tasks.some((task) => task.id === fromUrl)) setOpenTaskId(fromUrl);
  }, [searchParams, tasks]);

  const openTask = useCallback(
    (task: CommandTask) => {
      setOpenTaskId(task.id);
      router.replace(`/command?task=${task.id}`, { scroll: false });
    },
    [router],
  );
  const closeTask = useCallback(() => {
    setOpenTaskId(null);
    router.replace('/command', { scroll: false });
  }, [router]);

  const openedTask = useMemo(
    () => (openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null),
    [openTaskId, tasks],
  );

  const currentTeammateId = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid || !data?.teammates) return null;
    return data.teammates.find((tm) => tm.userId === uid)?.id ?? null;
  }, [session?.user?.id, data?.teammates]);

  return (
    <div className="v2-mc">
      <header className="v2-mc-hero">
        <div className="v2-mc-hero-left">
          <div className="v2-mc-tag">{t('title')}</div>
          <p className="v2-mc-sub">{t('subtitle')}</p>
        </div>
        <div className="v2-mc-hero-stats">
          <div className="v2-mc-stat">
            <div className="v2-mc-stat-num">{loading ? '·' : stats.active}</div>
            <div className="v2-mc-stat-lab">{t('stats.active')}</div>
          </div>
          <div className="v2-mc-stat">
            <div className="v2-mc-stat-num">{loading ? '·' : stats.queued}</div>
            <div className="v2-mc-stat-lab">{t('stats.queued')}</div>
          </div>
          <div className="v2-mc-stat">
            <div className="v2-mc-stat-num">{loading ? '·' : stats.review}</div>
            <div className="v2-mc-stat-lab">{t('stats.review')}</div>
          </div>
          <div className="v2-mc-stat" data-tone={stats.overdue > 0 ? 'crit' : undefined}>
            <div className="v2-mc-stat-num">{loading ? '·' : stats.overdue}</div>
            <div className="v2-mc-stat-lab">{t('stats.overdue')}</div>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="v2-mc-skeletons">
          <Skeleton height={120} />
          <Skeleton height={320} />
        </div>
      ) : (
        <>
          {data?.decisions && teamId && (
            <DecisionStack
              decisions={data.decisions}
              teammates={data.teammates}
              teamId={teamId}
              onChanged={() => {
                void mutate();
              }}
              onOpen={openTask}
            />
          )}
          <TeamTaskTable
            tasks={tasks}
            teammates={data?.teammates ?? []}
            projects={data?.projects ?? []}
            onOpen={openTask}
          />
        </>
      )}

      <TaskDetailPanel
        task={openedTask ? (openedTask as unknown as AgentTask) : null}
        isOpen={openedTask != null}
        currentTeammateId={currentTeammateId}
        isOwner={data?.role === 'owner'}
        onClose={closeTask}
        onRefresh={() => {
          void mutate();
        }}
      />

      <style>{`
        .v2-mc {
          max-width: 1200px;
          margin: 0 auto;
          padding: 110px 24px 80px;
        }
        .v2-mc-hero {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }
        .v2-mc-tag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--signature);
          margin-bottom: 8px;
        }
        .v2-mc-sub {
          color: var(--txt-muted);
          font-size: 14.5px;
          margin: 0;
          max-width: 480px;
        }
        .v2-mc-hero-stats {
          display: flex;
          gap: 10px;
        }
        .v2-mc-stat {
          min-width: 86px;
          padding: 12px 14px;
          border: 1px solid var(--rule, rgba(255,255,255,0.08));
          border-radius: 14px;
          text-align: center;
        }
        .v2-mc-stat[data-tone="crit"] { border-color: rgba(239,68,68,0.45); }
        .v2-mc-stat[data-tone="crit"] .v2-mc-stat-num { color: var(--danger); }
        .v2-mc-stat-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 22px;
          font-weight: 700;
          color: var(--txt-pure);
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .v2-mc-stat-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: var(--txt-faint);
          margin-top: 4px;
        }
        .v2-mc-skeletons { display: grid; gap: 16px; }

        .v2-mc-h2 {
          font-size: 15px;
          font-weight: 650;
          color: var(--txt-pure);
          margin: 0;
        }
        .v2-mc-table-sec { margin-top: 8px; }
        .v2-mc-table-head {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 14px;
        }
        .v2-mc-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
        }
        .v2-mc-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .v2-mc-search { max-width: 240px; }
        .v2-mc-clear {
          background: transparent;
          border: none;
          color: var(--signature);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 8px;
        }
        .v2-mc-table-wrap {
          border: 1px solid var(--rule, rgba(255,255,255,0.08));
          border-radius: 16px;
          overflow-x: auto;
        }
        .v2-mc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .v2-mc-table th {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.9px;
          text-transform: uppercase;
          color: var(--txt-faint);
          text-align: left;
          padding: 12px 14px;
          border-bottom: 1px solid var(--rule, rgba(255,255,255,0.08));
          white-space: nowrap;
        }
        .v2-mc-sort {
          all: unset;
          cursor: pointer;
          font: inherit;
          color: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          display: inline-flex;
          gap: 4px;
          align-items: center;
        }
        .v2-mc-sort:hover, .v2-mc-sort[data-active="true"] { color: var(--txt-muted); }
        .v2-mc-row { cursor: pointer; transition: background var(--dur-base, 0.18s) ease; }
        .v2-mc-row:hover, .v2-mc-row:focus-visible { background: var(--glass-hover, rgba(255,255,255,0.03)); outline: none; }
        .v2-mc-row td {
          padding: 11px 14px;
          border-bottom: 1px solid var(--rule, rgba(255,255,255,0.05));
          color: var(--txt-muted);
          vertical-align: middle;
        }
        .v2-mc-row:last-child td { border-bottom: none; }
        .v2-mc-cell-task { min-width: 240px; }
        .v2-mc-task-title {
          display: block;
          color: var(--txt-pure);
          font-weight: 550;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 420px;
        }
        .v2-mc-kind {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-mc-cell-mute { color: var(--txt-faint); white-space: nowrap; }
        .v2-mc-assignee { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
        .v2-mc-avatar-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
        .v2-mc-status {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid var(--rule, rgba(255,255,255,0.10));
          color: var(--txt-muted);
          white-space: nowrap;
        }
        .v2-mc-status[data-tone="info"] { border-color: rgba(var(--signature-rgb), 0.4); color: var(--signature); }
        .v2-mc-status[data-tone="warn"] { border-color: rgba(245,158,11,0.45); color: var(--warning); }
        .v2-mc-status[data-tone="crit"] { border-color: rgba(239,68,68,0.45); color: var(--danger); }
        .v2-mc-status[data-tone="ok"]   { border-color: rgba(34,197,94,0.4); color: var(--success); }
        .v2-mc-prio { font-size: 12px; color: var(--txt-faint); }
        .v2-mc-prio[data-prio="3"] { color: var(--danger); font-weight: 600; }

        @media (max-width: 860px) {
          .v2-mc { padding: 96px 14px 60px; }
          .v2-mc-hero-stats { flex-wrap: wrap; }
          .v2-mc-stat { min-width: 72px; padding: 10px 10px; }
        }
      `}</style>
    </div>
  );
}

export default function CommandPage() {
  return (
    <Suspense fallback={null}>
      <CommandPageInner />
    </Suspense>
  );
}
