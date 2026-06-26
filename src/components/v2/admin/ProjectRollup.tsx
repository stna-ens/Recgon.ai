'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui';
import type { CommandProject, CommandTask } from '@/components/v2/command/types';

// Per-project rollup on /admin — calm reference rows linking to each project's
// own task board. Counts derive purely from the command payload (no extra
// fetch). Rows are <Link> elements (not buttons), so the button-icon
// convention doesn't apply here.

const OPEN_STATUSES = new Set(['assigned', 'accepted', 'in_progress', 'unassigned']);

export interface ProjectRollupRow {
  id: string;
  name: string;
  open: number;
  scheduled: number;
  overdue: number;
}

// Pure derivation — exported so it is unit-testable without rendering.
// Tasks with a null projectId are excluded (they belong to no project board).
export function deriveProjectRollup(
  tasks: CommandTask[],
  projects: CommandProject[],
): ProjectRollupRow[] {
  const byId = new Map<string, ProjectRollupRow>();
  for (const p of projects) {
    byId.set(p.id, { id: p.id, name: p.name, open: 0, scheduled: 0, overdue: 0 });
  }
  for (const task of tasks) {
    if (!task.projectId) continue;
    const row = byId.get(task.projectId);
    if (!row) continue;
    if (OPEN_STATUSES.has(task.status)) row.open += 1;
    if (task.scheduledDate != null) row.scheduled += 1;
    if ((task.overdueTier ?? 0) > 0) row.overdue += 1;
  }
  return [...byId.values()];
}

interface Props {
  tasks: CommandTask[];
  projects: CommandProject[];
}

export default function ProjectRollup({ tasks, projects }: Props) {
  const t = useTranslations('command');
  const rows = useMemo(() => deriveProjectRollup(tasks, projects), [tasks, projects]);

  return (
    <section className="v2-roll-sec">
      <div className="v2-roll-head">
        <span className="recgon-label">{t('admin.rollup')}</span>
        <span className="v2-roll-count">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="◫"
          title={t('admin.empty')}
          description={t('admin.emptyHint')}
        />
      ) : (
        <ul className="v2-roll-list">
          {rows.map((r) => (
            <li key={r.id} className="v2-roll-row">
              <Link href={`/projects/${r.id}/tasks`} className="v2-roll-link">
                <span className="v2-roll-name">{r.name}</span>
                <span className="v2-roll-counts">
                  <span className="v2-roll-count-cell">
                    <strong>{r.open}</strong>
                    <span className="v2-roll-lab">{t('admin.open')}</span>
                  </span>
                  <span className="v2-roll-count-cell">
                    <strong>{r.scheduled}</strong>
                    <span className="v2-roll-lab">{t('admin.scheduled')}</span>
                  </span>
                  <span className="v2-roll-count-cell" data-crit={r.overdue > 0 ? 'true' : undefined}>
                    <strong>{r.overdue}</strong>
                    <span className="v2-roll-lab">{t('admin.overdue')}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .v2-roll-sec { display: flex; flex-direction: column; gap: 14px; }
        .v2-roll-head { display: flex; align-items: center; gap: 10px; }
        .v2-roll-head .recgon-label { margin-bottom: 0; }
        .v2-roll-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px; font-weight: 700; color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          border: 1px solid var(--rule); border-radius: 999px;
          min-width: 22px; text-align: center; padding: 1px 8px;
        }

        .v2-roll-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .v2-roll-row + .v2-roll-row { border-top: 1px solid var(--rule); }
        .v2-roll-link {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          min-height: 56px; padding: 10px 14px; border-radius: var(--r-sm, 14px);
          text-decoration: none; color: inherit;
          transition: background var(--dur-fast, 0.15s) ease;
        }
        .v2-roll-link:hover { background: rgba(255,255,255,0.035); }
        .v2-roll-link:hover .v2-roll-name { color: var(--signature); }
        .v2-roll-name {
          flex: 1 1 auto; min-width: 0;
          font-size: 13px; font-weight: 600; color: var(--txt-pure); letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: color var(--dur-fast, 0.15s) ease;
        }
        .v2-roll-counts { display: flex; align-items: center; gap: 22px; flex-shrink: 0; }
        .v2-roll-count-cell { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .v2-roll-count-cell strong {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px; font-weight: 700; color: var(--txt-pure);
          font-variant-numeric: tabular-nums; line-height: 1;
        }
        .v2-roll-count-cell[data-crit='true'] strong { color: var(--danger); }
        .v2-roll-lab {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px; font-weight: 600; letter-spacing: 0.5px;
          text-transform: uppercase; color: var(--txt-faint);
        }

        @media (max-width: 640px) {
          .v2-roll-counts { gap: 14px; }
        }
      `}</style>
    </section>
  );
}
