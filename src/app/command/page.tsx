'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Radar, Zap, Inbox, Eye, CircleAlert } from 'lucide-react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import { Skeleton, Modal, Button } from '@/components/ui';
import DispatchFloor from '@/components/v2/command/DispatchFloor';
import { CreateTaskModal } from '@/components/v2/tasks/CreateTaskModal';
import type { CommandResponse } from '@/components/v2/command/types';

// Operations — the DISPATCH FLOOR. A console header states the situation, then
// DispatchFloor carries the work: NEEDS YOU (judgment calls) · QUEUE (the
// dispatch backlog) · ROSTER (teammate pods, load vs capacity) · the full
// table as a reference drawer. This is where the owner RUNS the team — distinct
// from Home (the read-only glance) and Calendar (the time view).
//
// House system only: glass-card, JetBrains Mono labels, signature pink, tone
// tokens used functionally (load / decision severity).

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

  // ── Situation: tone + headline + sub ──────────────────────────────────────
  const headTone = loading
    ? undefined
    : hasDecisions
      ? 'warn'
      : counts.overdue > 0
        ? 'crit'
        : 'good';
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

  const gauges = [
    { key: 'active', Icon: Zap, value: counts.active, tone: 'sig' as const },
    { key: 'queued', Icon: Inbox, value: counts.queued, tone: undefined },
    { key: 'review', Icon: Eye, value: counts.review, tone: 'warn' as const },
    { key: 'overdue', Icon: CircleAlert, value: counts.overdue, tone: counts.overdue > 0 ? ('crit' as const) : undefined },
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
      {/* ── CONSOLE HEADER ─────────────────────────────────────────────── */}
      <header className="glass-card v2-ops-console" data-tone={headTone}>
        <div className="v2-ops-top">
          <div className="v2-ops-id">
            <Radar size={14} strokeWidth={2.2} />
            <span>{t('title')}</span>
            <span className="v2-ops-id-sep">·</span>
            <span className="v2-ops-id-sub">{t('dispatch.floorTag')}</span>
            <span className="v2-ops-live" aria-hidden />
          </div>
          {isOwner && (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {tTasks('createTask.newButton')}
            </Button>
          )}
        </div>

        <h1 className="v2-ops-headline">{headline}</h1>
        <p className="v2-ops-sub">{sub}</p>

        <div className="v2-ops-readout" role="group" aria-label={t('title')}>
          {gauges.map(({ key, Icon, value, tone }) => (
            <div key={key} className="v2-ops-gauge" data-tone={tone}>
              <div className="v2-ops-gauge-top">
                <Icon size={14} strokeWidth={2.2} />
                <span className="v2-ops-gauge-lab">{t(`stats.${key}`)}</span>
              </div>
              <div className="v2-ops-gauge-num">{loading ? '·' : value}</div>
            </div>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="v2-ops-skeletons">
          <Skeleton height={72} />
          <div className="v2-ops-skel-roster">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={150} />
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
          padding: 104px 24px 80px;
          display: flex;
          flex-direction: column;
          gap: 26px;
        }

        @keyframes opsRise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }

        /* ── Console header ───────────────────────────────────────────── */
        .v2-ops-console {
          position: relative;
          padding: 24px 30px 0;
          overflow: hidden;
          animation: opsRise var(--dur-page, 0.5s) var(--ease-out, cubic-bezier(0.16,1,0.3,1)) both;
        }
        .v2-ops-console::before {
          content: '';
          position: absolute;
          inset: 0 0 auto 0;
          height: 2px;
          background: linear-gradient(90deg, rgba(var(--signature-rgb), 0.55) 0%, rgba(var(--signature-rgb), 0) 42%);
        }
        .v2-ops-console[data-tone='good']::before { background: linear-gradient(90deg, rgba(var(--success-rgb),0.5), rgba(var(--success-rgb),0) 42%); }
        .v2-ops-console[data-tone='warn']::before { background: linear-gradient(90deg, rgba(var(--warning-rgb),0.55), rgba(var(--warning-rgb),0) 42%); }
        .v2-ops-console[data-tone='crit']::before { background: linear-gradient(90deg, rgba(var(--danger-rgb),0.6),  rgba(var(--danger-rgb),0) 42%); }

        .v2-ops-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }
        .v2-ops-id {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: var(--signature);
        }
        .v2-ops-console[data-tone='good'] .v2-ops-id { color: var(--success); }
        .v2-ops-console[data-tone='warn'] .v2-ops-id { color: var(--warning); }
        .v2-ops-console[data-tone='crit'] .v2-ops-id { color: var(--danger); }
        .v2-ops-id-sep { opacity: 0.4; }
        .v2-ops-id-sub { color: var(--txt-faint); letter-spacing: 1.4px; }
        .v2-ops-live {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          animation: opsPulse 2.4s ease-out infinite;
        }
        @keyframes opsPulse {
          0%   { box-shadow: 0 0 0 0 rgba(var(--signature-rgb), 0.5); opacity: 1; }
          70%  { box-shadow: 0 0 0 5px rgba(var(--signature-rgb), 0); opacity: 0.75; }
          100% { box-shadow: 0 0 0 0 rgba(var(--signature-rgb), 0); opacity: 1; }
        }

        .v2-ops-headline {
          margin: 0 0 6px;
          font-size: clamp(22px, 3vw, 30px);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--txt-pure);
          line-height: 1.15;
        }
        .v2-ops-sub {
          margin: 0 0 22px;
          color: var(--txt-muted);
          font-size: 14px;
          line-height: 1.55;
          max-width: 520px;
        }

        /* ── Instrument readout strip ─────────────────────────────────── */
        .v2-ops-readout {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid var(--rule);
          margin: 0 -30px;
        }
        .v2-ops-gauge {
          padding: 16px 18px 18px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: var(--txt-faint);
          position: relative;
        }
        .v2-ops-gauge + .v2-ops-gauge { border-left: 1px solid var(--rule); }
        .v2-ops-gauge[data-tone='sig']  { color: var(--signature); }
        .v2-ops-gauge[data-tone='warn'] { color: var(--warning); }
        .v2-ops-gauge[data-tone='crit'] { color: var(--danger); }
        .v2-ops-gauge[data-tone='sig']::after,
        .v2-ops-gauge[data-tone='warn']::after,
        .v2-ops-gauge[data-tone='crit']::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 0;
          height: 2px;
          background: currentColor;
          opacity: 0.55;
        }
        .v2-ops-gauge-top { display: inline-flex; align-items: center; gap: 7px; }
        .v2-ops-gauge-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .v2-ops-gauge-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 26px;
          font-weight: 700;
          line-height: 1;
          color: var(--txt-pure);
          font-variant-numeric: tabular-nums;
        }

        .v2-ops-skeletons { display: flex; flex-direction: column; gap: 16px; }
        .v2-ops-skel-roster {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(264px, 1fr));
          gap: 14px;
        }

        /* ── Shortcut help ────────────────────────────────────────────── */
        .v2-ops-keys { display: grid; gap: 10px; margin: 0; }
        .v2-ops-keys div { display: flex; align-items: baseline; gap: 14px; }
        .v2-ops-keys dt { min-width: 70px; }
        .v2-ops-keys dd { margin: 0; color: var(--txt-muted); font-size: 13px; }
        .v2-ops-keys kbd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--rule, rgba(255,255,255,0.1));
          border-radius: 4px;
          padding: 1px 6px;
        }

        @media (max-width: 860px) {
          .v2-ops { padding: 92px 14px 60px; gap: 18px; }
          .v2-ops-console { padding: 20px 20px 0; }
          .v2-ops-readout { grid-template-columns: repeat(2, 1fr); margin: 0 -20px; }
          .v2-ops-gauge:nth-child(2) { border-left: none; }
          .v2-ops-gauge:nth-child(3),
          .v2-ops-gauge:nth-child(4) { border-top: 1px solid var(--rule); }
          .v2-ops-top { margin-bottom: 12px; }
          .v2-ops-skel-roster { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .v2-ops-console { animation: none; }
          .v2-ops-live { animation: none; }
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
