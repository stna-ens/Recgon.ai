'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  cleanText,
  relTimeShort,
  pulseCopy,
  priority,
  projectInitial,
  type ProjectPulse,
} from './utils';

export interface PortfolioRow {
  id: string;
  name: string;
  currentStage: string | null;
  overallScore: number | null;
  analyzedAt: string | null;
  topRisk: string | null;
  topNextStep: string | null;
  pulse: ProjectPulse;
  betAgeDays: number | null;
  logoUrl?: string;
}

interface Props {
  projects: PortfolioRow[];
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

function ProductAvatar({ name, logoUrl }: { name: string; logoUrl?: string }) {
  if (logoUrl) {
    return (
      <span className="v2-products-avatar" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          className="v2-products-avatar-img"
          onError={(e) => {
            const el = e.currentTarget.parentElement!;
            el.textContent = projectInitial(name);
          }}
        />
      </span>
    );
  }
  return <span className="v2-products-avatar" aria-hidden="true">{projectInitial(name)}</span>;
}

function ProductCard({ project, now }: { project: PortfolioRow; now: number }) {
  const risk = cleanText(project.topRisk);
  const nextStep = cleanText(project.topNextStep);
  const hash = project.id.replace(/-/g, '').slice(0, 7);

  return (
    <article className="v2-products-card" data-pulse={project.pulse}>
      <div className="v2-products-card-head">
        <ProductAvatar name={project.name} logoUrl={project.logoUrl} />
        <div className="v2-products-id">
          <h3>{project.name}</h3>
          <span>
            {project.currentStage ?? 'No stage'}
            <i>·</i>
            <code>{hash}</code>
          </span>
        </div>
        <span className="v2-products-status">{pulseCopy(project.pulse)}</span>
      </div>

      <div className="v2-products-body">
        <div className="v2-products-field">
          <span className="v2-products-label">Risk</span>
          <p>{risk || 'No risk recorded yet.'}</p>
        </div>
        <div className="v2-products-field">
          <span className="v2-products-label">Next move</span>
          <p>{nextStep || 'Open the project to decide the next move.'}</p>
        </div>
      </div>

      <div className="v2-products-foot">
        <span className="v2-products-time">{project.analyzedAt ? `${relTimeShort(project.analyzedAt, now)} ago` : 'never analyzed'}</span>
        <Link href={`/projects/${project.id}`} className="v2-products-open">Open</Link>
      </div>
    </article>
  );
}

export default function HomePortfolio({ projects, loading }: Props) {
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

  const stats = useMemo(() => {
    const needsAttention = projects.filter((p) => p.pulse === 'drifting' || p.pulse === 'stuck').length;
    const moving = projects.filter((p) => p.pulse === 'shipping' || p.pulse === 'converging').length;
    const idle = projects.filter((p) => p.pulse === 'idle').length;
    return { needsAttention, moving, idle };
  }, [projects]);

  return (
    <section className="v2-products">
      <header className="v2-products-head">
        <div className="v2-sec-idx" aria-label="Section 3, products">
          <span className="v2-sec-idx-num">03</span>
          <span className="v2-sec-idx-lab">products</span>
        </div>
        <div className="v2-products-summary" aria-label="Product summary">
          <span><strong>{stats.needsAttention}</strong> need attention</span>
          <span><strong>{stats.moving}</strong> moving</span>
          <span><strong>{stats.idle}</strong> idle</span>
        </div>
        <Link href="/projects" className="v2-products-all">All products</Link>
      </header>

      {!loading && projects.length > 0 && (
        <div className="v2-products-filters" aria-label="Filter products">
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
      )}

      <div className="v2-products-shell">
        {loading ? (
          <div className="v2-products-skel">
            <span />
            <span />
            <span />
          </div>
        ) : projects.length === 0 ? (
          <div className="v2-products-empty">
            <p>No products yet.</p>
            <Link href="/projects">Add a product</Link>
          </div>
        ) : sorted.length === 0 ? (
          <div className="v2-products-empty">
            <p>No products in this status.</p>
            <button type="button" onClick={() => setFilter('all')}>Show all</button>
          </div>
        ) : (
          <div className="v2-products-grid">
            {sorted.slice(0, 6).map((project) => (
              <ProductCard key={project.id} project={project} now={now} />
            ))}
          </div>
        )}
      </div>

      <style>{stylesheet}</style>
    </section>
  );
}

const stylesheet = `
  .v2-products {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .v2-products-head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .v2-products-summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-left: auto;
  }

  .v2-products-summary span {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.026);
    color: var(--txt-muted);
    font-size: 11px;
    font-weight: 650;
  }

  .v2-products-summary strong {
    color: var(--txt-pure);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }

  .v2-products-all {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 11px;
    border: 1px solid rgba(var(--signature-rgb), 0.22);
    border-radius: 999px;
    color: var(--signature);
    text-decoration: none;
    font-size: 11px;
    font-weight: 750;
    transition: background 160ms ease, transform 160ms ease, border-color 160ms ease;
  }

  .v2-products-all:hover {
    transform: translateY(-1px);
    background: rgba(var(--signature-rgb), 0.07);
    border-color: rgba(var(--signature-rgb), 0.38);
  }

  .v2-products-filters {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .v2-products-filters button {
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

  .v2-products-filters button:hover:not(:disabled):not(.is-active) {
    color: var(--txt-muted);
    border-color: rgba(var(--signature-rgb), 0.28);
  }

  .v2-products-filters button:disabled {
    opacity: 0.36;
    cursor: not-allowed;
  }

  .v2-products-filters button.is-active {
    color: var(--txt-pure);
    background: rgba(var(--signature-rgb), 0.12);
    border-color: rgba(var(--signature-rgb), 0.42);
  }

  .v2-products-filters strong {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .v2-products-shell {
    border-radius: 12px;
    padding: 10px;
    background:
      var(--bg-content) padding-box,
      linear-gradient(135deg, rgba(var(--signature-rgb), 0.2), rgba(var(--signature-rgb), 0.04) 48%, rgba(var(--signature-rgb), 0.12)) border-box;
    border: 1px solid transparent;
    box-shadow:
      0 18px 40px -20px rgba(0, 0, 0, 0.38),
      inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .v2-products-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .v2-products-card {
    position: relative;
    min-width: 0;
    min-height: 232px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 15px;
    border: 1px solid var(--rule);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.028);
    overflow: hidden;
  }

  .v2-products-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 999px;
    background: var(--txt-faint);
  }

  .v2-products-card[data-pulse='drifting']::before { background: var(--danger, #dc2626); box-shadow: 0 0 10px rgba(220, 38, 38, 0.4); }
  .v2-products-card[data-pulse='stuck']::before { background: var(--warning, #d97706); }
  .v2-products-card[data-pulse='shipping']::before { background: var(--success, #059669); }
  .v2-products-card[data-pulse='converging']::before { background: var(--signature); }

  .v2-products-card-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 11px;
    align-items: center;
  }

  .v2-products-avatar {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: white;
    background: rgba(var(--signature-rgb), 0.7);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    font-weight: 850;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 8px 16px rgba(0, 0, 0, 0.18);
    overflow: hidden;
  }

  .v2-products-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .v2-products-id {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .v2-products-id h3 {
    margin: 0;
    color: var(--txt-pure);
    font-size: 15px;
    font-weight: 750;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .v2-products-id span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 700;
    text-transform: lowercase;
  }

  .v2-products-id code {
    color: var(--txt-faint);
    font: inherit;
  }

  .v2-products-status {
    grid-column: 1 / -1;
    width: fit-content;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    color: var(--txt-muted);
    background: rgba(255, 255, 255, 0.025);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .v2-products-card[data-pulse='drifting'] .v2-products-status { color: var(--danger, #dc2626); border-color: rgba(220, 38, 38, 0.24); }
  .v2-products-card[data-pulse='stuck'] .v2-products-status { color: var(--warning, #d97706); border-color: rgba(217, 119, 6, 0.24); }
  .v2-products-card[data-pulse='shipping'] .v2-products-status { color: var(--success, #059669); border-color: rgba(16, 185, 129, 0.24); }
  .v2-products-card[data-pulse='converging'] .v2-products-status { color: var(--signature); border-color: rgba(var(--signature-rgb), 0.26); }

  .v2-products-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }

  .v2-products-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .v2-products-label {
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.55px;
  }

  .v2-products-field p {
    margin: 0;
    color: var(--txt-muted);
    font-size: 12.5px;
    line-height: 1.42;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .v2-products-foot {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 9px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }

  .v2-products-score,
  .v2-products-time {
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .v2-products-score[data-tone='bad'] { color: var(--danger, #dc2626); }
  .v2-products-score[data-tone='mid'] { color: var(--warning, #d97706); }
  .v2-products-score[data-tone='good'] { color: var(--success, #059669); }

  .v2-products-open {
    justify-self: end;
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    border-radius: 7px;
    border: 1px solid rgba(var(--signature-rgb), 0.26);
    color: var(--signature);
    text-decoration: none;
    font-size: 12px;
    font-weight: 800;
    transition: transform 160ms ease, background 160ms ease;
  }

  .v2-products-open:hover {
    transform: translateY(-1px);
    background: rgba(var(--signature-rgb), 0.08);
  }

  .v2-products-empty {
    min-height: 170px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--txt-muted);
    text-align: center;
  }

  .v2-products-empty p {
    margin: 0;
  }

  .v2-products-empty a,
  .v2-products-empty button {
    border: 0;
    background: transparent;
    color: var(--signature);
    font: inherit;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  .v2-products-skel {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .v2-products-skel span {
    height: 220px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    animation: v2ProductsSkel 1.4s ease-in-out infinite alternate;
  }

  @keyframes v2ProductsSkel {
    from { opacity: 0.45; }
    to { opacity: 0.85; }
  }

  @media (max-width: 1120px) {
    .v2-products-grid,
    .v2-products-skel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 740px) {
    .v2-products-summary {
      margin-left: 0;
      width: 100%;
    }
    .v2-products-grid,
    .v2-products-skel {
      grid-template-columns: 1fr;
    }
    .v2-products-filters {
      overflow-x: auto;
      flex-wrap: nowrap;
      padding-bottom: 2px;
    }
    .v2-products-filters button {
      flex: 0 0 auto;
    }
  }
`;
