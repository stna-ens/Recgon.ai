'use client';

import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { TeammateAvatar } from '@/components/v2/TeammateAvatar';
import type { CommandTask, CommandTeammate } from './types';

// A single teammate on the Dispatch Floor: who they are, how loaded they are
// (real in-flight hours vs capacity), what they're actively on, and what
// they're good at. Colour is FUNCTIONAL — it tracks load, nothing else.
// All styling lives in DispatchFloor's single <style> block so a roster of
// N pods doesn't emit N copies of the CSS.

export interface TeammatePodProps {
  teammate: CommandTeammate;
  liveTasks: CommandTask[];
  onOpenTask: (taskId: string) => void;
}

// Load band drives the bar fill + numeric colour (high/med/low/idle).
function loadBand(loadPct: number, isIdle: boolean): 'idle' | 'high' | 'med' | 'low' {
  if (isIdle) return 'idle';
  if (loadPct >= 90) return 'high';
  if (loadPct >= 60) return 'med';
  return 'low';
}

// Chip dot tone reflects the task's own urgency.
function chipTone(task: CommandTask): 'crit' | 'warn' | 'sig' | 'mute' {
  if ((task.overdueTier ?? 0) > 0) return 'crit';
  if (task.status === 'awaiting_review') return 'warn';
  if (task.status === 'in_progress' || task.status === 'accepted') return 'sig';
  return 'mute';
}

export default function TeammatePod({ teammate, liveTasks, onOpenTask }: TeammatePodProps) {
  const t = useTranslations('command');

  const loadPct = teammate.loadPct ?? 0;
  const cap = teammate.capacityHours ?? 0;
  const hrs = Math.round(teammate.inFlightHours ?? 0);
  const isIdle = teammate.isIdle ?? liveTasks.length === 0;
  const state = loadPct >= 100 ? 'over' : isIdle ? 'idle' : 'ok';
  const band = loadBand(loadPct, isIdle);
  const skills = (teammate.skills ?? []).slice(0, 5);

  return (
    <div className="v2-pod" data-state={state}>
      <div className="v2-pod-head">
        <TeammateAvatar
          name={teammate.displayName}
          avatarUrl={teammate.avatarUrl}
          avatarColor={teammate.avatarColor}
          isIdle={isIdle}
          size={28}
        />
        <div className="v2-pod-id">
          <span className="v2-pod-name">{teammate.displayName}</span>
          {teammate.stars != null && (
            <span className="v2-pod-stars">
              <Star size={10} strokeWidth={2.4} fill="currentColor" />
              {teammate.stars.toFixed(1)}
            </span>
          )}
        </div>
        {state !== 'ok' && (
          <span className="v2-pod-state" data-state={state}>
            {state === 'over' ? t('dispatch.pod.overloaded') : t('dispatch.pod.idle')}
          </span>
        )}
      </div>

      <div className="v2-pod-load">
        <div className="v2-pod-load-head">
          <span className="v2-pod-load-lab">{t('dispatch.pod.load')}</span>
          <span className="v2-pod-load-val" data-load={band}>
            {cap > 0 ? t('dispatch.pod.hours', { used: hrs, cap }) : t('dispatch.pod.noCapacity')}
          </span>
        </div>
        <div
          className="v2-pod-load-track"
          role="progressbar"
          aria-valuenow={loadPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('dispatch.pod.loadAria', { name: teammate.displayName, pct: loadPct })}
        >
          <div
            className="v2-pod-load-fill"
            data-load={band}
            style={{ width: `${Math.min(100, Math.max(2, loadPct))}%` }}
          />
        </div>
      </div>

      <div className="v2-pod-live">
        {liveTasks.length === 0 ? (
          <span className="v2-pod-empty">{t('dispatch.pod.noLive')}</span>
        ) : (
          liveTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className="v2-pod-chip"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTask(task.id);
              }}
            >
              <span className="v2-pod-chip-dot" data-tone={chipTone(task)} />
              <span className="v2-pod-chip-title">{task.title}</span>
              {task.estimatedHours ? <span className="v2-pod-chip-h">{task.estimatedHours}h</span> : null}
            </button>
          ))
        )}
      </div>

      {skills.length > 0 && (
        <div className="v2-pod-skills">
          {skills.map((s) => (
            <span key={s} className="v2-pod-skill">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
