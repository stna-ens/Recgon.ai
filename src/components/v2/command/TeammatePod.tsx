'use client';

import { useTranslations } from 'next-intl';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';
import { taskDisplayTitle } from '@/lib/recgon/displayTitle';
import type { CommandTask, CommandTeammate } from './types';

// A teammate on the Dispatch Floor — built to look like a tasks-board card:
// calm, light, mostly grayscale, generous whitespace. Load is a single quiet
// bar (signature pink), red ONLY when over capacity. No stars, no coloured
// status dots, no rainbow — colour is rare and functional. CSS lives in
// DispatchFloor's <style> block.

export interface TeammatePodProps {
  teammate: CommandTeammate;
  liveTasks: CommandTask[];
  onOpenTask: (taskId: string) => void;
}

export default function TeammatePod({ teammate, liveTasks, onOpenTask }: TeammatePodProps) {
  const t = useTranslations('command');

  const loadPct = teammate.loadPct ?? 0;
  const cap = teammate.capacityHours ?? 0;
  const hrs = Math.round(teammate.inFlightHours ?? 0);
  const isIdle = teammate.isIdle ?? liveTasks.length === 0;
  const over = loadPct >= 100;

  const shown = liveTasks.slice(0, 2);
  const extra = liveTasks.length - shown.length;
  const skills = (teammate.skills ?? []).slice(0, 3);

  return (
    <div className="v2-pod">
      <div className="v2-pod-head">
        <TeammateAvatar
          name={teammate.displayName}
          avatarUrl={teammate.avatarUrl}
          avatarColor={teammate.avatarColor}
          isIdle={isIdle}
          size={26}
        />
        <span className="v2-pod-name">{teammate.displayName}</span>
        <span className="v2-pod-load-pct" data-over={over ? 'true' : undefined} data-idle={isIdle ? 'true' : undefined}>
          {isIdle ? t('dispatch.pod.idle') : `${loadPct}%`}
        </span>
      </div>

      <div className="v2-pod-bar" aria-hidden="true">
        <div
          className="v2-pod-bar-fill"
          data-over={over ? 'true' : undefined}
          style={{ width: `${Math.min(100, Math.max(isIdle ? 0 : 4, loadPct))}%` }}
        />
      </div>
      <span className="v2-pod-hrs">
        {cap > 0 ? t('dispatch.pod.hours', { used: hrs, cap }) : t('dispatch.pod.noCapacity')}
      </span>

      <div className="v2-pod-tasks">
        {shown.length === 0 ? (
          <span className="v2-pod-free">{t('dispatch.pod.noLive')}</span>
        ) : (
          <>
            {shown.map((task) => (
              <button key={task.id} type="button" className="v2-pod-task" onClick={() => onOpenTask(task.id)}>
                <span className="v2-pod-task-title">{taskDisplayTitle(task)}</span>
                {task.estimatedHours ? <span className="v2-pod-task-h">{task.estimatedHours}h</span> : null}
              </button>
            ))}
            {extra > 0 && <span className="v2-pod-more">{t('dispatch.pod.more', { count: extra })}</span>}
          </>
        )}
      </div>

      {skills.length > 0 && (
        <div className="v2-pod-skills">
          {skills.map((s) => (
            <span key={s} className="v2-pod-skill">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
