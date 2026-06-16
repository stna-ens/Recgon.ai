'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui';
import Select from '@/components/Select';
import type { CommandTask, CommandTeammate } from './types';

// The dispatch backlog: unassigned work waiting for a person. The owner picks
// a teammate inline (the assign POST is owned by DispatchFloor); members see a
// read-only list they can open. Tasks Recgon couldn't auto-route carry a
// triageNote explaining why — surfaced as a warn hint so the owner knows what
// the blocker was before they assign.

export interface DispatchQueueProps {
  tasks: CommandTask[];
  teammates: CommandTeammate[];
  isOwner: boolean;
  busy: Record<string, boolean>;
  onAssign: (taskId: string, teammateId: string) => void;
  onOpenTask: (taskId: string) => void;
}

export default function DispatchQueue({ tasks, teammates, isOwner, busy, onAssign, onOpenTask }: DispatchQueueProps) {
  const t = useTranslations('command');
  const tTasks = useTranslations('tasks');
  const [picks, setPicks] = useState<Record<string, string>>({});

  const options = teammates.map((tm) => ({ value: tm.id, label: tm.displayName }));

  return (
    <section className="glass-card v2-dq" aria-label={t('dispatch.queue.title')}>
      <div className="v2-dq-head">
        <span className="recgon-label">{t('dispatch.queue.title')}</span>
        <span className="v2-dq-count">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="v2-dq-empty">
          <EmptyState compact title={t('dispatch.queue.empty')} />
        </div>
      ) : (
        <ul className="v2-dq-list">
          {tasks.map((task) => {
            const reason = task.triageNote ? tTasks(`triage.${task.triageNote}`) : null;
            return (
              <li key={task.id} className="v2-dq-row">
                <button
                  type="button"
                  className="v2-dq-main"
                  onClick={() => onOpenTask(task.id)}
                  aria-label={task.title}
                >
                  <span className="v2-dq-prio" data-prio={task.priority} aria-hidden />
                  <span className="v2-dq-body">
                    <span className="v2-dq-title">{task.title}</span>
                    <span className="v2-dq-meta">
                      <span className="v2-dq-kind">{t(`kind.${task.kind}`)}</span>
                      {task.estimatedHours ? <span> · {t('table.hoursShort', { count: task.estimatedHours })}</span> : null}
                      {reason ? <span className="v2-dq-reason"> · {reason}</span> : null}
                    </span>
                  </span>
                </button>
                {isOwner && (
                  <div className="v2-dq-assign">
                    <Select
                      size="sm"
                      value={picks[task.id] ?? ''}
                      placeholder={t('dispatch.queue.assign')}
                      options={options}
                      onChange={(v) => {
                        setPicks((p) => ({ ...p, [task.id]: v }));
                        onAssign(task.id, v);
                      }}
                      style={{ minWidth: 150, opacity: busy[task.id] ? 0.5 : 1, pointerEvents: busy[task.id] ? 'none' : undefined }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
