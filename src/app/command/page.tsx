'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Radar, Zap, Inbox, Eye, CircleAlert } from 'lucide-react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Skeleton, Modal } from '@/components/ui';
import TeamTaskTable, { type CommandView } from '@/components/v2/command/TeamTaskTable';
import DecisionStack from '@/components/v2/command/DecisionStack';
import { TaskDetailPanel } from '@/components/v2/calendar/TaskDetailPanel';
import type { AgentTask } from '@/lib/recgon/types';
import type { CommandResponse, CommandTask } from '@/components/v2/command/types';

// Mission Control — the team-wide task picture in one screen.
//
// Design language inherited from /verify (the house's reference surface):
// glass-card hero whose HEADLINE states the situation ("3 decisions need
// you" / "All clear"), tone-coded stat chips, and filter pills that drive
// the list below. The owner's decision stack comes first (the Phase 3.5
// lesson: attention, not workload); members get a "mine" lens instead.

const ACTIVE = new Set(['assigned', 'accepted', 'in_progress']);
const LIVE = new Set(['assigned', 'accepted', 'in_progress', 'awaiting_review', 'unassigned']);

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
  const isOwner = data?.role === 'owner';

  const currentTeammateId = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid || !data?.teammates) return null;
    return data.teammates.find((tm) => tm.userId === uid)?.id ?? null;
  }, [session?.user?.id, data?.teammates]);

  const counts = useMemo(() => {
    let active = 0;
    let queued = 0;
    let review = 0;
    let overdue = 0;
    let mine = 0;
    for (const task of tasks) {
      if (ACTIVE.has(task.status)) active += 1;
      if (task.status === 'unassigned') queued += 1;
      if (task.status === 'awaiting_review') review += 1;
      if ((task.overdueTier ?? 0) > 0 && ACTIVE.has(task.status)) overdue += 1;
      if (currentTeammateId && task.assignedTo === currentTeammateId && LIVE.has(task.status)) mine += 1;
    }
    return { all: tasks.length, active, queued, review, overdue, mine };
  }, [tasks, currentTeammateId]);

  const decisionCount = data?.decisions
    ? data.decisions.rescheduleRequests.length +
      data.decisions.overdue.length +
      data.decisions.triaged.length +
      data.decisions.awaitingReview.length
    : 0;

  // ── Hero copy: the headline states the situation ─────────────────────────
  const headTone = loading
    ? undefined
    : isOwner && decisionCount > 0
      ? 'warn'
      : counts.overdue > 0
        ? 'crit'
        : 'good';
  const headline = loading
    ? '··'
    : tasks.length === 0
      ? t('headline.empty')
      : isOwner && decisionCount > 0
        ? t('headline.decisions', { count: decisionCount })
        : counts.overdue > 0
          ? t('headline.overdue', { count: counts.overdue })
          : t('headline.clear');
  const sub =
    tasks.length === 0 && !loading
      ? t('sub.empty')
      : isOwner
        ? t('sub.owner')
        : t('sub.member');

  // ── View pills (drive the list) ───────────────────────────────────────────
  const [view, setView] = useState<CommandView>('all');
  const pills = useMemo(() => {
    const base: Array<{ value: CommandView; count: number; tone: 'mute' | 'sig' | 'warn' | 'crit' }> = [
      { value: 'all', count: counts.all, tone: 'mute' },
    ];
    if (currentTeammateId) base.push({ value: 'mine', count: counts.mine, tone: 'sig' });
    base.push(
      { value: 'active', count: counts.active, tone: 'sig' },
      { value: 'queued', count: counts.queued, tone: 'mute' },
      { value: 'review', count: counts.review, tone: 'warn' },
      { value: 'overdue', count: counts.overdue, tone: 'crit' },
    );
    return base;
  }, [counts, currentTeammateId]);

  // ── Detail panel + ?task= deep link ───────────────────────────────────────
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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

  // "?" opens the shortcut help (unless typing in a field).
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      setHelpOpen((v) => !v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="v2-mc">
      {/* HERO */}
      <div className="glass-card v2-mc-hero" data-tone={headTone}>
        <div className="v2-mc-hero-grid">
          <div className="v2-mc-hero-left">
            <div className="v2-mc-tag">
              <Radar size={14} strokeWidth={2.2} />
              <span>{t('title')}</span>
            </div>
            <h1 className="v2-mc-headline">{headline}</h1>
            <p className="v2-mc-sub">{sub}</p>
          </div>
          <div className="v2-mc-hero-right">
            <div className="v2-mc-stat" data-tone="sig">
              <Zap size={16} strokeWidth={2.2} />
              <div className="v2-mc-stat-num">{loading ? '·' : counts.active}</div>
              <div className="v2-mc-stat-lab">{t('stats.active')}</div>
            </div>
            <div className="v2-mc-stat">
              <Inbox size={16} strokeWidth={2.2} />
              <div className="v2-mc-stat-num">{loading ? '·' : counts.queued}</div>
              <div className="v2-mc-stat-lab">{t('stats.queued')}</div>
            </div>
            <div className="v2-mc-stat" data-tone="warn">
              <Eye size={16} strokeWidth={2.2} />
              <div className="v2-mc-stat-num">{loading ? '·' : counts.review}</div>
              <div className="v2-mc-stat-lab">{t('stats.review')}</div>
            </div>
            <div className="v2-mc-stat" data-tone={counts.overdue > 0 ? 'crit' : undefined}>
              <CircleAlert size={16} strokeWidth={2.2} />
              <div className="v2-mc-stat-num">{loading ? '·' : counts.overdue}</div>
              <div className="v2-mc-stat-lab">{t('stats.overdue')}</div>
            </div>
          </div>
        </div>

        {!loading && tasks.length > 0 && (
          <div className="v2-mc-pills" role="tablist">
            {pills.map((p) => (
              <button
                key={p.value}
                type="button"
                role="tab"
                aria-selected={view === p.value}
                className={`v2-mc-pill ${view === p.value ? 'is-active' : ''}`}
                data-tone={p.tone}
                onClick={() => setView(p.value)}
                disabled={p.count === 0 && p.value !== 'all'}
              >
                <span className="v2-mc-pill-dot" />
                <span className="v2-mc-pill-lab">{t(`pills.${p.value}`)}</span>
                <span className="v2-mc-pill-num">{p.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="v2-mc-skeletons">
          <Skeleton height={120} />
          <Skeleton height={320} />
        </div>
      ) : (
        <>
          {data?.decisions && teamId && decisionCount > 0 && (
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
            view={view}
            currentTeammateId={currentTeammateId}
            shortcutsEnabled={openTaskId == null && !helpOpen}
          />
        </>
      )}

      <TaskDetailPanel
        task={openedTask ? (openedTask as unknown as AgentTask) : null}
        isOpen={openedTask != null}
        currentTeammateId={currentTeammateId}
        isOwner={isOwner}
        onClose={closeTask}
        onRefresh={() => {
          void mutate();
        }}
      />

      <Modal open={helpOpen} onOpenChange={setHelpOpen} title={t('shortcuts.heading')} size="sm">
        <dl className="v2-mc-keys">
          <div><dt><kbd>j</kbd> <kbd>k</kbd></dt><dd>{t('shortcuts.navigate')}</dd></div>
          <div><dt><kbd>↵</kbd></dt><dd>{t('shortcuts.open')}</dd></div>
          <div><dt><kbd>esc</kbd></dt><dd>{t('shortcuts.close')}</dd></div>
          <div><dt><kbd>⌘K</kbd></dt><dd>{t('shortcuts.palette')}</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>{t('shortcuts.help')}</dd></div>
        </dl>
      </Modal>

      <style>{`
        .v2-mc {
          max-width: 1160px;
          margin: 0 auto;
          padding: 104px 24px 80px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          animation: v2mcFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2mcFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }

        /* ── Hero ─────────────────────────────────────────────────────── */
        .v2-mc-hero { padding: 28px 32px 24px; }
        .v2-mc-hero-grid {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 28px;
          flex-wrap: wrap;
        }
        .v2-mc-hero-left { min-width: 0; flex: 1 1 320px; }
        .v2-mc-tag {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--signature);
          margin-bottom: 10px;
        }
        .v2-mc-hero[data-tone='good'] .v2-mc-tag { color: var(--success, #059669); }
        .v2-mc-hero[data-tone='warn'] .v2-mc-tag { color: var(--warning, #d97706); }
        .v2-mc-hero[data-tone='crit'] .v2-mc-tag { color: var(--danger, #dc2626); }
        .v2-mc-headline {
          margin: 0 0 6px;
          font-size: clamp(22px, 3vw, 30px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--txt-pure);
          line-height: 1.15;
        }
        .v2-mc-sub {
          margin: 0;
          color: var(--txt-muted);
          font-size: 14px;
          line-height: 1.55;
          max-width: 460px;
        }
        .v2-mc-hero-right {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-mc-stat {
          min-width: 80px;
          padding: 10px 14px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.18);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          color: var(--txt-faint);
        }
        .v2-mc-stat[data-tone='sig']  { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.24); }
        .v2-mc-stat[data-tone='warn'] { color: var(--warning); border-color: rgba(217, 119, 6, 0.24); }
        .v2-mc-stat[data-tone='crit'] { color: var(--danger); border-color: rgba(220, 38, 38, 0.24); }
        .v2-mc-stat-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 21px;
          font-weight: 700;
          color: var(--txt-pure);
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .v2-mc-stat-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        /* ── Pills ────────────────────────────────────────────────────── */
        .v2-mc-pills {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid var(--rule, rgba(255,255,255,0.07));
        }
        .v2-mc-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          background: transparent;
          border: none;
          border-radius: 5px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-faint);
          cursor: pointer;
          transition: background 180ms ease, color 180ms ease;
        }
        .v2-mc-pill:hover:not(:disabled):not(.is-active) {
          color: var(--txt-muted);
          background: rgba(255, 255, 255, 0.03);
        }
        .v2-mc-pill.is-active { background: rgba(255, 255, 255, 0.06); color: var(--txt-pure); }
        .v2-mc-pill:disabled { opacity: 0.4; cursor: not-allowed; }
        .v2-mc-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--txt-faint); flex-shrink: 0; }
        .v2-mc-pill[data-tone='sig'] .v2-mc-pill-dot  { background: var(--signature); }
        .v2-mc-pill[data-tone='warn'] .v2-mc-pill-dot { background: var(--warning, #d97706); }
        .v2-mc-pill[data-tone='crit'] .v2-mc-pill-dot { background: var(--danger, #dc2626); }
        .v2-mc-pill.is-active[data-tone='sig'] .v2-mc-pill-dot  { box-shadow: 0 0 6px var(--signature); }
        .v2-mc-pill.is-active[data-tone='warn'] .v2-mc-pill-dot { box-shadow: 0 0 6px var(--warning, #d97706); }
        .v2-mc-pill.is-active[data-tone='crit'] .v2-mc-pill-dot { box-shadow: 0 0 6px var(--danger, #dc2626); }
        .v2-mc-pill-num { font-variant-numeric: tabular-nums; color: var(--txt-faint); font-weight: 600; opacity: 0.85; }
        .v2-mc-pill.is-active .v2-mc-pill-num { color: var(--txt-pure); opacity: 1; }

        .v2-mc-skeletons { display: grid; gap: 16px; }

        /* ── Shortcut help ───────────────────────────────────────────── */
        .v2-mc-keys { display: grid; gap: 10px; margin: 0; }
        .v2-mc-keys div { display: flex; align-items: baseline; gap: 14px; }
        .v2-mc-keys dt { min-width: 70px; }
        .v2-mc-keys dd { margin: 0; color: var(--txt-muted); font-size: 13px; }
        .v2-mc-keys kbd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--rule, rgba(255,255,255,0.1));
          border-radius: 4px;
          padding: 1px 6px;
        }

        @media (max-width: 860px) {
          .v2-mc { padding: 92px 14px 60px; gap: 16px; }
          .v2-mc-hero { padding: 22px 20px 18px; }
          .v2-mc-stat { min-width: 70px; padding: 10px 10px 8px; }
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
