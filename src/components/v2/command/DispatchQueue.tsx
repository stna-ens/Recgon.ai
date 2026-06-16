'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui';
import Select from '@/components/Select';
import type { CommandTask, CommandTeammate } from './types';

// The dispatch backlog: unassigned work waiting for a person. Rendered as calm
// tasks-board cards (faint kind label, dark title, muted meta) — no coloured
// rails. The owner assigns inline; tasks Recgon couldn't auto-route carry the
// reason as muted text. CSS lives in DispatchFloor's <style> block.

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

  if (tasks.length === 0) {
    return <EmptyState compact title={t('dispatch.queue.empty')} />;
  }

  return (
    <div className="v2-dq-grid">
      {tasks.map((task) => {
        const reason = task.triageNote ? tTasks(`triage.${task.triageNote}`) : null;
        return (
          <article key={task.id} className="v2-dq-card">
            <button type="button" className="v2-dq-main" onClick={() => onOpenTask(task.id)} aria-label={task.title}>
              <span className="v2-dq-kind">{t(`kind.${task.kind}`)}</span>
              <span className="v2-dq-title">{task.title}</span>
              <span className="v2-dq-meta">
                {task.estimatedHours ? <span className="v2-dq-chip">{t('table.hoursShort', { count: task.estimatedHours })}</span> : null}
                {reason ? <span className="v2-dq-reason">{reason}</span> : null}
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
                  style={{ minWidth: 140, opacity: busy[task.id] ? 0.5 : 1, pointerEvents: busy[task.id] ? 'none' : undefined }}
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
