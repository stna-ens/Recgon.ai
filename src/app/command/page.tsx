'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Skeleton, Modal, Button } from '@/components/ui';
import DispatchFloor from '@/components/v2/command/DispatchFloor';
import { CreateTaskModal } from '@/components/v2/tasks/CreateTaskModal';
import type { CommandResponse } from '@/components/v2/command/types';

// Operations — the DISPATCH FLOOR. Where the owner runs the team. Visual
// language is the calm, light, mostly-grayscale house style (the tasks board /
// team page): a section-head with eyebrow + headline, a quiet stat row, then
// airy sections. Colour is rare and functional — never decorative.

const ACTIVE = new Set(['assigned', 'accepted', 'in_progress']);

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function CommandPageInner() {
  const t = useTranslations('command');
  const tTasks = useTranslations('tasks');
  const { currentTeam } = useTeam();
  const { data: session } = useSession();
  const { addToast } = useToast();
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

  const teammates = data?.teammates;
  const currentTeammateId = useMemo(() => {
    const uid = session?.user?.id;
    if (!uid || !teammates) return null;
    return teammates.find((tm) => tm.userId === uid)?.id ?? null;
  }, [session?.user?.id, teammates]);

  const counts = useMemo(() => {
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

  // "Needs you" = judgment calls only (reschedule / overdue / awaiting review).
  // Triaged work is assignable, so it lives in the queue, not here.
  const decisionCount = data?.decisions
    ? data.decisions.rescheduleRequests.length +
      data.decisions.overdue.length +
      data.decisions.awaitingReview.length
    : 0;
  const hasDecisions = isOwner && decisionCount > 0;

  const headline = loading
    ? '··'
    : tasks.length === 0
      ? t('headline.empty')
      : hasDecisions
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

  // ── Manual create-task (owner-only) ───────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const createTeammates = useMemo(
    () => (data?.teammates ?? []).map((tm) => ({ id: tm.id, displayName: tm.displayName })),
    [data?.teammates],
  );
  const createProjects = useMemo(
    () => (data?.projects ?? []).map((p) => ({ id: p.id, name: p.name })),
    [data?.projects],
  );

  // Quiet stat row — grayscale; only a live overdue count earns colour.
  const stats = [
    { key: 'active', value: counts.active, crit: false },
    { key: 'queued', value: counts.queued, crit: false },
    { key: 'review', value: counts.review, crit: false },
    { key: 'overdue', value: counts.overdue, crit: counts.overdue > 0 },
  ];

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
    <div className="v2-ops">
      <header className="v2-ops-head">
        <div className="v2-ops-head-top">
          <div className="v2-ops-head-lead">
            <span className="recgon-label">{t('title')} · {t('dispatch.floorTag')}</span>
            <h1 className="v2-ops-title">{headline}</h1>
            <p className="v2-ops-sub">{sub}</p>
          </div>
          {isOwner && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {tTasks('createTask.newButton')}
            </Button>
          )}
        </div>
        <div className="v2-ops-stats">
          {stats.map((s) => (
            <div key={s.key} className="v2-ops-stat" data-crit={s.crit ? 'true' : undefined}>
              <span className="v2-ops-stat-num">{loading ? '·' : s.value}</span>
              <span className="v2-ops-stat-lab">{t(`stats.${s.key}`)}</span>
            </div>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="v2-ops-skeletons">
          <Skeleton height={56} />
          <div className="v2-ops-skel-roster">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={104} />
            ))}
          </div>
        </div>
      ) : data && teamId ? (
        <DispatchFloor
          data={data}
          teamId={teamId}
          currentTeammateId={currentTeammateId}
          isOwner={Boolean(isOwner)}
          onChanged={() => {
            void mutate();
          }}
        />
      ) : null}

      {teamId && (
        <CreateTaskModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          teamId={teamId}
          teammates={createTeammates}
          projects={createProjects}
          onCreated={() => {
            void mutate();
          }}
        />
      )}

      <Modal open={helpOpen} onOpenChange={setHelpOpen} title={t('shortcuts.heading')} size="sm">
        <dl className="v2-ops-keys">
          <div><dt><kbd>j</kbd> <kbd>k</kbd></dt><dd>{t('shortcuts.navigate')}</dd></div>
          <div><dt><kbd>esc</kbd></dt><dd>{t('shortcuts.close')}</dd></div>
          <div><dt><kbd>⌘K</kbd></dt><dd>{t('shortcuts.palette')}</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>{t('shortcuts.help')}</dd></div>
        </dl>
      </Modal>

      <style>{`
        .v2-ops {
          max-width: 1160px;
          margin: 0 auto;
          padding: 96px 24px 80px;
          display: flex;
          flex-direction: column;
          gap: 36px;
        }

        /* ── Header (section-head style, matches tasks/home) ──────────── */
        .v2-ops-head { display: flex; flex-direction: column; gap: 22px; }
        .v2-ops-head-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 18px; flex-wrap: wrap;
        }
        .v2-ops-head-lead { min-width: 0; }
        .v2-ops-head-lead .recgon-label { margin-bottom: 12px; }
        .v2-ops-title {
          margin: 0 0 8px;
          font-size: clamp(26px, 3.4vw, 34px);
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--txt-pure);
          line-height: 1.12;
        }
        .v2-ops-sub {
          margin: 0; color: var(--txt-muted);
          font-size: 14px; line-height: 1.55; max-width: 560px;
        }
        .v2-ops-stats { display: flex; gap: 40px; flex-wrap: wrap; }
        .v2-ops-stat { display: flex; flex-direction: column; gap: 4px; }
        .v2-ops-stat-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 22px; font-weight: 700; line-height: 1;
          color: var(--txt-pure); font-variant-numeric: tabular-nums;
        }
        .v2-ops-stat[data-crit='true'] .v2-ops-stat-num { color: var(--danger); }
        .v2-ops-stat-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 600; letter-spacing: 0.6px;
          text-transform: uppercase; color: var(--txt-faint);
        }

        .v2-ops-skeletons { display: flex; flex-direction: column; gap: 20px; }
        .v2-ops-skel-roster {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(264px, 1fr)); gap: 14px;
        }

        /* ── Shortcut help ────────────────────────────────────────────── */
        .v2-ops-keys { display: grid; gap: 10px; margin: 0; }
        .v2-ops-keys div { display: flex; align-items: baseline; gap: 14px; }
        .v2-ops-keys dt { min-width: 70px; }
        .v2-ops-keys dd { margin: 0; color: var(--txt-muted); font-size: 13px; }
        .v2-ops-keys kbd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px; font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--rule, rgba(255,255,255,0.1));
          border-radius: 4px; padding: 1px 6px;
        }

        @media (max-width: 860px) {
          .v2-ops { padding: 84px 16px 60px; gap: 28px; }
          .v2-ops-stats { gap: 28px; }
          .v2-ops-skel-roster { grid-template-columns: 1fr; }
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
