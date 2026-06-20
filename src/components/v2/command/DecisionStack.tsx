'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { Button, useConfirm } from '@/components/ui';
import Select from '@/components/Select';
import { formatDay } from '@/lib/datetime';
import { daysOverdue } from '@/lib/recgon/overduePolicy';
import { taskDisplayTitle } from '@/lib/recgon/displayTitle';
import type { CommandDecisions, CommandTask, CommandTeammate } from './types';

// The "needs your decision" stack — owner-only (the API already gates it;
// this component simply never receives data for members).
//
// Group order encodes urgency-of-judgment, not workload:
//   1. Reschedule requests — a human is actively waiting for an answer.
//   2. Seriously overdue   — pressure escalation exhausted, needs a call.
//   3. Triaged             — Recgon refused to guess; only the owner can.
//   4. Awaiting review     — work done, needs sign-off.

export interface DecisionStackProps {
  decisions: CommandDecisions;
  teammates: CommandTeammate[];
  teamId: string;
  onChanged: () => void;
  // When provided, the "awaiting review" action opens the task in the on-page
  // detail panel (where the owner verifies / reassigns) instead of navigating
  // to /verify — so every action stays on the Operations page.
  onOpenReview?: (taskId: string) => void;
}

type Busy = Record<string, boolean>;

export default function DecisionStack({ decisions, teammates, teamId, onChanged, onOpenReview }: DecisionStackProps) {
  const t = useTranslations('command');
  const tTasks = useTranslations('tasks');
  const locale = useLocale();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<Busy>({});
  // Per-task pick in the assign/reassign dropdowns.
  const [picks, setPicks] = useState<Record<string, string>>({});

  const teammateById = useMemo(() => {
    const m = new Map<string, CommandTeammate>();
    teammates.forEach((tm) => m.set(tm.id, tm));
    return m;
  }, [teammates]);

  const today = useMemo(() => new Date(), []);

  const total =
    decisions.rescheduleRequests.length +
    decisions.overdue.length +
    decisions.triaged.length +
    decisions.awaitingReview.length;

  const run = async (taskId: string, fn: () => Promise<Response>, okMsg: string, failMsg: string) => {
    setBusy((b) => ({ ...b, [taskId]: true }));
    try {
      const res = await fn();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast(okMsg, 'success');
      onChanged();
    } catch {
      addToast(failMsg, 'error');
    } finally {
      setBusy((b) => ({ ...b, [taskId]: false }));
    }
  };

  const approveReschedule = (task: CommandTask) => {
    if (!task.assignedTo || !task.rescheduleRequestedDate) return;
    void run(
      task.id,
      () =>
        fetch(`/api/teams/${teamId}/tasks/${task.id}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teammateId: task.assignedTo,
            scheduledDate: task.rescheduleRequestedDate,
          }),
        }),
      t('decisions.reschedule.approved'),
      t('decisions.reschedule.failed'),
    );
  };

  const denyReschedule = (task: CommandTask) => {
    void run(
      task.id,
      () =>
        fetch(`/api/teams/${teamId}/tasks/${task.id}/reschedule-request`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dismiss' }),
        }),
      t('decisions.reschedule.denied'),
      t('decisions.reschedule.failed'),
    );
  };

  const snooze = (task: CommandTask, days: number) => {
    void run(
      task.id,
      () =>
        fetch(`/api/teams/${teamId}/tasks/${task.id}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        }),
      t('decisions.overdue.snoozed', { count: days }),
      t('decisions.overdue.snoozeFailed'),
    );
  };

  const assignTriaged = (task: CommandTask) => {
    const assigneeId = picks[task.id];
    if (!assigneeId) return;
    const name = teammateById.get(assigneeId)?.displayName ?? '';
    void run(
      task.id,
      () =>
        fetch(`/api/recgon/tasks/${task.id}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeId }),
        }),
      t('decisions.triaged.assigned', { name }),
      t('decisions.triaged.assignFailed'),
    );
  };

  const cancelTriaged = async (task: CommandTask) => {
    const ok = await confirm({
      title: t('decisions.triaged.cancelConfirmTitle'),
      description: t('decisions.triaged.cancelConfirmBody'),
      destructive: true,
    });
    if (!ok) return;
    void run(
      task.id,
      () =>
        fetch(`/api/teams/${teamId}/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' }),
        }),
      t('decisions.triaged.cancelled'),
      t('decisions.triaged.assignFailed'),
    );
  };

  const assigneeName = (task: CommandTask) =>
    task.assignedTo ? teammateById.get(task.assignedTo)?.displayName ?? '' : '';

  const teammateOptions = teammates.map((tm) => ({ value: tm.id, label: tm.displayName }));

  return (
    <div className="v2-mc-ds" aria-label={t('decisions.heading')}>
      {total === 0 ? (
        <p className="v2-mc-ds-empty">{t('decisions.empty')}</p>
      ) : (
        <div className="v2-mc-ds-groups">
          {decisions.rescheduleRequests.length > 0 && (
            <div className="v2-mc-ds-group">
              <div className="v2-mc-ds-group-lab">{t('decisions.groups.reschedule')}</div>
              {decisions.rescheduleRequests.map((task) => (
                <div key={task.id} className="v2-mc-ds-card" data-tone="info">
                  <div className="v2-mc-ds-card-main">
                    <div className="v2-mc-ds-title">
                      {taskDisplayTitle(task)}
                    </div>
                    <p className="v2-mc-ds-meta">
                      <strong>{assigneeName(task)}</strong>{' '}
                      {task.rescheduleRequestedDate
                        ? t('decisions.reschedule.requestedFor', {
                            date: formatDay(task.rescheduleRequestedDate, locale),
                          })
                        : t('decisions.reschedule.noDate')}
                    </p>
                    {task.rescheduleRequestNote && (
                      <p className="v2-mc-ds-note">{task.rescheduleRequestNote}</p>
                    )}
                  </div>
                  <div className="v2-mc-ds-actions">
                    {task.rescheduleRequestedDate && task.assignedTo && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy[task.id]}
                        onClick={() => approveReschedule(task)}
                      >
                        {t('decisions.reschedule.approve')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy[task.id]} onClick={() => denyReschedule(task)}>
                      {t('decisions.reschedule.deny')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {decisions.overdue.length > 0 && (
            <div className="v2-mc-ds-group">
              <div className="v2-mc-ds-group-lab">{t('decisions.groups.overdue')}</div>
              {decisions.overdue.map((task) => {
                const endKey = task.scheduledUntilDate ?? task.scheduledDate;
                const late = endKey ? daysOverdue(endKey, today) : 0;
                return (
                  <div key={task.id} className="v2-mc-ds-card" data-tone="crit">
                    <div className="v2-mc-ds-card-main">
                      <div className="v2-mc-ds-title">
                        {taskDisplayTitle(task)}
                      </div>
                      <p className="v2-mc-ds-meta">
                        <strong>{assigneeName(task)}</strong>
                        {late > 0 && (
                          <span className="v2-mc-ds-late"> · {t('decisions.overdue.daysLate', { count: late })}</span>
                        )}
                      </p>
                    </div>
                    <div className="v2-mc-ds-actions">
                      {[1, 3, 7].map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="secondary"
                          disabled={busy[task.id]}
                          onClick={() => snooze(task, d)}
                        >
                          {t(`decisions.overdue.snooze${d}`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {decisions.triaged.length > 0 && (
            <div className="v2-mc-ds-group">
              <div className="v2-mc-ds-group-lab">{t('decisions.groups.triaged')}</div>
              {decisions.triaged.map((task) => (
                <div key={task.id} className="v2-mc-ds-card" data-tone="warn">
                  <div className="v2-mc-ds-card-main">
                    <div className="v2-mc-ds-title">
                      {taskDisplayTitle(task)}
                    </div>
                    {task.triageNote && (
                      <p className="v2-mc-ds-note">{tTasks(`triage.${task.triageNote}`)}</p>
                    )}
                  </div>
                  <div className="v2-mc-ds-actions">
                    <Select
                      size="sm"
                      value={picks[task.id] ?? ''}
                      onChange={(v) => setPicks((p) => ({ ...p, [task.id]: v }))}
                      placeholder={t('decisions.triaged.assign')}
                      options={teammateOptions}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy[task.id]}
                      disabled={!picks[task.id]}
                      onClick={() => assignTriaged(task)}
                    >
                      {t('decisions.triaged.assignButton')}
                    </Button>
                    <Button size="sm" variant="danger-ghost" disabled={busy[task.id]} onClick={() => void cancelTriaged(task)}>
                      {t('decisions.triaged.cancel')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {decisions.awaitingReview.length > 0 && (
            <div className="v2-mc-ds-group">
              <div className="v2-mc-ds-group-lab">{t('decisions.groups.review')}</div>
              {decisions.awaitingReview.map((task) => (
                <div key={task.id} className="v2-mc-ds-card" data-tone="warn">
                  <div className="v2-mc-ds-card-main">
                    <div className="v2-mc-ds-title">
                      {taskDisplayTitle(task)}
                    </div>
                    <p className="v2-mc-ds-meta">
                      <strong>{assigneeName(task)}</strong>
                    </p>
                  </div>
                  <div className="v2-mc-ds-actions">
                    <Button size="sm" variant="secondary" onClick={() => onOpenReview?.(task.id)}>
                      {t('decisions.review.open')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        /* Bare + calm — the floor's section-head provides the title. Cards are
           tasks-board surfaces with no coloured rails; colour only on the
           sparse "days late" figure. */
        .v2-mc-ds { display: flex; flex-direction: column; gap: 8px; }
        .v2-mc-ds-empty { color: var(--txt-faint); font-size: 13px; margin: 0; padding: 4px 2px; }
        .v2-mc-ds-groups { display: flex; flex-direction: column; gap: 14px; }
        .v2-mc-ds-group { display: flex; flex-direction: column; gap: 8px; }
        .v2-mc-ds-group-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
          text-transform: uppercase; color: var(--txt-faint);
        }
        .v2-mc-ds-card {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
          background: var(--glass-substrate);
          border: 1px solid var(--rule);
          border-radius: var(--r-sm, 14px);
          padding: 12px 14px;
          box-shadow: var(--shadow-float);
          transition: border-color var(--dur-base, 0.22s) var(--ease-out, cubic-bezier(0.16,1,0.3,1));
        }
        .v2-mc-ds-card:hover { border-color: rgba(var(--signature-rgb), 0.30); }
        .v2-mc-ds-card-main { min-width: 0; flex: 1 1 280px; }
        .v2-mc-ds-title {
          display: block; color: var(--txt-pure); font-size: 13px; font-weight: 600;
          letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
        }
        .v2-mc-ds-meta { margin: 4px 0 0; font-size: 12px; color: var(--txt-muted); }
        .v2-mc-ds-meta strong { color: var(--txt-muted); font-weight: 600; }
        .v2-mc-ds-late { color: var(--danger); }
        .v2-mc-ds-note { margin: 5px 0 0; font-size: 12px; font-style: italic; color: var(--txt-faint); max-width: 560px; }
        .v2-mc-ds-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
      `}</style>
    </div>
  );
}
