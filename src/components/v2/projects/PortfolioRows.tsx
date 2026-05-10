'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  relTimeShort,
  pulseShort,
  priority,
  projectInitial,
  type ProjectPulse,
} from '../utils';
import type { PortfolioRow } from '../HomePortfolio';

export type Ownership = 'mine' | 'shared-by-me' | 'from-team';
export type Visibility = 'personal' | 'team-shared';

export interface RowMeta {
  sourceType?: 'codebase' | 'github' | 'description' | string;
  hasUpdate?: boolean;
  ownership?: Ownership;
  ownerName?: string | null;
  visibility?: Visibility;
  teamId?: string;
  teamName?: string;
}

interface Props {
  projects: PortfolioRow[];
  meta: Record<string, RowMeta>;
  loading: boolean;
}

type FilterKey = ProjectPulse | 'all';

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'drifting', label: 'Drifting' },
  { value: 'stuck', label: 'Stuck' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'converging', label: 'Converging' },
  { value: 'idle', label: 'Idle' },
];

const SOURCE_LABEL: Record<string, string> = {
  codebase: 'codebase',
  github: 'github',
  description: 'idea',
};

function ownershipShort(o: Ownership | undefined, teamName: string | null | undefined): string | null {
  if (o === 'mine') return 'private';
  if (o === 'shared-by-me') return teamName ? `shared · ${teamName}` : 'shared';
  if (o === 'from-team') return teamName ? `from ${teamName}` : 'from team';
  return null;
}

export default function PortfolioRows({ projects, meta, loading }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const now = Date.now();

  const sorted = useMemo(() => {
    const list = filter === 'all' ? projects : projects.filter((p) => p.pulse === filter);
    return [...list].sort((a, b) => {
      const p = priority(a) - priority(b);
      if (p !== 0) return p;
      const aTime = a.analyzedAt ? new Date(a.analyzedAt).getTime() : 0;
      const bTime = b.analyzedAt ? new Date(b.analyzedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [projects, filter]);

  if (loading) {
    return (
      <div className="glass-card is-static v2-pr-card">
        <div className="v2-pr-skel">
          <span />
          <span />
          <span />
          <span />
        </div>
        <style>{stylesheet}</style>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="v2-pr">
        <div className="glass-card is-static v2-pr-card v2-pr-card-empty">
          <p className="v2-pr-empty">No other projects to show.</p>
        </div>
        <style>{stylesheet}</style>
      </div>
    );
  }

  return (
    <div className="v2-pr">
      <div className="v2-pr-filters" aria-label="Filter projects">
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? projects.length : projects.filter((p) => p.pulse === f.value).length;
          return (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? 'is-active' : ''}
              onClick={() => setFilter(f.value)}
              disabled={count === 0 && f.value !== 'all'}
            >
              <span>{f.label}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="glass-card is-static v2-pr-card">
        {sorted.length === 0 ? (
          <p className="v2-pr-empty">No projects in this status.</p>
        ) : (
          <ul className="v2-pr-list">
            {sorted.map((p) => {
              const m = meta[p.id] ?? {};
              const sourceLabel = m.sourceType ? SOURCE_LABEL[m.sourceType] : null;
              const ownerLabel = ownershipShort(m.ownership, m.teamName);
              return (
                <li key={p.id} className="v2-pr-row" data-pulse={p.pulse}>
                  <Link href={`/projects/${p.id}`} className="v2-pr-link">
                    <span className="v2-pr-avatar" aria-hidden="true">
                      {p.logoUrl
                        ? <img src={p.logoUrl} alt="" className="v2-pr-avatar-img" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).textContent = projectInitial(p.name); }} />
                        : projectInitial(p.name)}
                    </span>
                    <span className="v2-pr-main">
                      <span className="v2-pr-name">
                        {p.name}
                        {m.hasUpdate && (
                          <span className="v2-pr-warn" title="New commits since last analysis">! new commits</span>
                        )}
                      </span>
                      <span className="v2-pr-meta-line">
                        {p.currentStage && <span className="v2-pr-stage">{p.currentStage}</span>}
                        {sourceLabel && (
                          <>
                            {p.currentStage && <span className="v2-pr-sep">·</span>}
                            <span className={`v2-pr-source v2-pr-source-${m.sourceType ?? 'unknown'}`}>{sourceLabel}</span>
                          </>
                        )}
                        {ownerLabel && (
                          <>
                            <span className="v2-pr-sep">·</span>
                            <span className={`v2-pr-own v2-pr-own-${m.ownership}`}>{ownerLabel}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="v2-pr-pulse" data-pulse={p.pulse}>{pulseShort(p.pulse)}</span>
                    <span className="v2-pr-time">
                      {p.analyzedAt ? `${relTimeShort(p.analyzedAt, now)} ago` : 'never'}
                    </span>
                    <span className="v2-pr-arrow" aria-hidden="true">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <style>{stylesheet}</style>
    </div>
  );
}

const stylesheet = `
  .v2-pr {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .v2-pr-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .v2-pr-filters button {
    min-height: 31px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 11px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.022);
    color: var(--txt-faint);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  }
  .v2-pr-filters button:hover:not(:disabled):not(.is-active) {
    color: var(--txt-muted);
    border-color: rgba(var(--signature-rgb), 0.28);
  }
  .v2-pr-filters button:disabled {
    opacity: 0.36;
    cursor: not-allowed;
  }
  .v2-pr-filters button.is-active {
    color: var(--txt-pure);
    background: rgba(var(--signature-rgb), 0.12);
    border-color: rgba(var(--signature-rgb), 0.42);
  }
  .v2-pr-filters strong {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .v2-pr-card {
    padding: 6px;
    border-radius: 12px;
  }
  .v2-pr-card-empty {
    padding: 22px;
  }

  .v2-pr-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .v2-pr-row + .v2-pr-row {
    border-top: 1px solid var(--rule);
  }
  .v2-pr-link {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    gap: 12px;
    align-items: center;
    min-height: 56px;
    padding: 10px 14px;
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: background 160ms ease, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
    position: relative;
  }
  .v2-pr-link:hover {
    background: rgba(255, 255, 255, 0.035);
    transform: translateX(2px);
  }
  .v2-pr-link:hover .v2-pr-arrow {
    color: var(--signature);
    transform: translateX(2px);
  }

  .v2-pr-avatar {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--signature-rgb), 0.18);
    border: 1px solid rgba(var(--signature-rgb), 0.22);
    color: var(--txt-pure);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
    overflow: hidden;
  }

  .v2-pr-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .v2-pr-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .v2-pr-name {
    color: var(--txt-pure);
    font-size: 13.5px;
    font-weight: 650;
    letter-spacing: -0.005em;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .v2-pr-warn {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 999px;
    color: var(--warning, #d97706);
    background: rgba(255, 159, 10, 0.08);
    border: 1px solid rgba(255, 159, 10, 0.30);
    white-space: nowrap;
  }
  .v2-pr-meta-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: var(--txt-faint);
    text-transform: lowercase;
    letter-spacing: 0.3px;
  }
  .v2-pr-stage {
    color: var(--txt-muted);
    font-weight: 700;
  }
  .v2-pr-sep { opacity: 0.5; }
  .v2-pr-source {
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-pr-source-description { color: #a78bfa; }

  /* Ownership chip — quiet, lives next to source */
  .v2-pr-own {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.2px;
  }
  .v2-pr-own-mine          { color: var(--txt-faint); background: rgba(255,255,255,0.022); }
  .v2-pr-own-shared-by-me  { color: var(--signature); background: rgba(var(--signature-rgb), 0.08); border-color: rgba(var(--signature-rgb), 0.22); }
  .v2-pr-own-from-team     { color: #93c5fd;          background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.22); }

  .v2-pr-pulse {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    color: var(--txt-faint);
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: rgba(255, 255, 255, 0.025);
    white-space: nowrap;
    min-width: 92px;
    text-align: center;
  }
  /* Drifting reads as soft / awaiting (signature pink), not alarm. */
  .v2-pr-pulse[data-pulse='drifting']   { color: var(--signature);        border-color: rgba(var(--signature-rgb), 0.26); background: rgba(var(--signature-rgb), 0.06); }
  .v2-pr-pulse[data-pulse='stuck']      { color: var(--warning, #d97706); border-color: rgba(217, 119, 6, 0.26);          background: rgba(217, 119, 6, 0.06); }
  .v2-pr-pulse[data-pulse='shipping']   { color: var(--success, #059669); border-color: rgba(16, 185, 129, 0.26);         background: rgba(16, 185, 129, 0.06); }
  .v2-pr-pulse[data-pulse='converging'] { color: var(--signature);        border-color: rgba(var(--signature-rgb), 0.26); background: rgba(var(--signature-rgb), 0.04); }

  .v2-pr-time {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--txt-faint);
    min-width: 64px;
    text-align: right;
    letter-spacing: 0.2px;
  }

  .v2-pr-arrow {
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 14px;
    font-weight: 700;
    transition: color 200ms ease, transform 200ms ease;
  }

  .v2-pr-empty {
    margin: 0;
    padding: 22px 14px;
    color: var(--txt-muted);
    font-size: 13px;
    text-align: center;
  }

  .v2-pr-skel {
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 6px;
  }
  .v2-pr-skel span {
    height: 56px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.04);
    animation: v2prSkel 1.4s ease-in-out infinite alternate;
  }
  @keyframes v2prSkel {
    from { opacity: 0.4; }
    to   { opacity: 0.8; }
  }

  @media (max-width: 760px) {
    .v2-pr-link {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
    }
    .v2-pr-time { display: none; }
    .v2-pr-filters {
      overflow-x: auto;
      flex-wrap: nowrap;
      padding-bottom: 2px;
    }
    .v2-pr-filters button { flex: 0 0 auto; }
  }
`;
