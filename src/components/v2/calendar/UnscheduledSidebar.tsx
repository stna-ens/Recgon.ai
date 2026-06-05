'use client';

import type { DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AgentTask } from '@/lib/recgon/types';
import { EmptyState } from '@/components/ui';
import { stripMd } from '@/lib/strings';

const KIND_KEYS = new Set(['next_step', 'dev_prompt', 'marketing', 'analytics', 'research', 'custom']);

type Props = {
  tasks: AgentTask[];
  onSelect: (t: AgentTask) => void;
  canDrag?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>, task: AgentTask) => void;
  onDragEnd?: () => void;
};

function priorityColor(p: number): string {
  if (p <= 0) return 'var(--danger)';
  if (p === 1) return 'var(--warning)';
  return 'var(--txt-faint)';
}

function priorityLabel(p: number): string {
  if (p <= 0) return 'P0';
  if (p === 1) return 'P1';
  if (p === 2) return 'P2';
  return `P${p}`;
}

export function UnscheduledSidebar({ tasks, onSelect, canDrag = false, onDragStart, onDragEnd }: Props) {
  const t = useTranslations('calendar');
  return (
    <aside className="cal-unsched-sidebar" aria-label={t('unsched.aria')}>
      <div className="cal-unsched-header">
        <span className="cal-unsched-eyebrow">{t('unsched.title')}</span>
        <span className="cal-unsched-count">{tasks.length}</span>
      </div>
      <ul className="cal-unsched-list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={`cal-unsched-item${canDrag ? ' is-draggable' : ''}`}
              onClick={() => onSelect(task)}
              draggable={canDrag}
              onDragStart={(e) => onDragStart?.(e, task)}
              onDragEnd={onDragEnd}
            >
              <span className="cal-unsched-priority" style={{ color: priorityColor(task.priority) }}>
                {priorityLabel(task.priority)}
              </span>
              <span className="cal-unsched-title">{stripMd(task.title)}</span>
              <span className="cal-unsched-kind">{KIND_KEYS.has(task.kind) ? t(`unsched.kind.${task.kind}`) : task.kind}</span>
            </button>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="cal-unsched-empty">
            <EmptyState
              compact
              icon="┄"
              title={t('unsched.allClear')}
              description={t('unsched.allClearDesc')}
            />
          </li>
        )}
      </ul>
      <style>{css}</style>
    </aside>
  );
}

const css = `
.cal-unsched-sidebar {
  width: 260px;
  flex-shrink: 0;
  border-left: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--bg-page, var(--bg-card));
  /* Hide scrollbar until hover (Firefox) */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color var(--dur-base) ease;
}
.cal-unsched-sidebar::-webkit-scrollbar { width: 10px; }
.cal-unsched-sidebar::-webkit-scrollbar-track { background: transparent; }
.cal-unsched-sidebar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 6px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background var(--dur-base) ease;
}
.cal-unsched-sidebar:hover { scrollbar-color: rgba(var(--signature-rgb), 0.30) transparent; }
.cal-unsched-sidebar:hover::-webkit-scrollbar-thumb {
  background: rgba(var(--signature-rgb), 0.30);
  background-clip: padding-box;
}
.cal-unsched-sidebar:hover::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--signature-rgb), 0.50);
  background-clip: padding-box;
}
.cal-unsched-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--rule);
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 2;
}
.cal-unsched-eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.6px;
  color: var(--warning);
  text-transform: uppercase;
}
.cal-unsched-count {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 18px;
  font-weight: 600;
  color: var(--txt-pure);
  letter-spacing: -0.01em;
}
.cal-unsched-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cal-unsched-list li { border-bottom: 1px solid var(--rule); }
.cal-unsched-item {
  width: 100%;
  display: grid;
  grid-template-columns: 26px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast) ease;
  outline: none;
}
.cal-unsched-item:hover { background: rgba(var(--signature-rgb), 0.05); }
.cal-unsched-item.is-draggable { cursor: grab; }
.cal-unsched-item.is-draggable:active { cursor: grabbing; }
.cal-unsched-item:focus-visible {
  background: rgba(var(--signature-rgb), 0.08);
  box-shadow: inset 2px 0 0 var(--signature);
}
.cal-unsched-priority {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  align-self: start;
  margin-top: 1px;
}
.cal-unsched-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--txt-pure);
  line-height: 1.45;
  letter-spacing: 0.2px;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cal-unsched-kind {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--txt-faint);
  flex-shrink: 0;
  align-self: start;
  margin-top: 2px;
}
.cal-unsched-empty { border-bottom: none; }
`;
