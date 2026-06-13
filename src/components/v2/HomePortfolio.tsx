'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton, EmptyState, Button } from '@/components/ui';
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

const FILTERS: { value: FilterKey; labelKey: string }[] = [
  { value: 'all', labelKey: 'portfolio.filterAll' },
  { value: 'drifting', labelKey: 'portfolio.filterDrifting' },
  { value: 'stuck', labelKey: 'portfolio.filterStuck' },
  { value: 'shipping', labelKey: 'portfolio.filterShipping' },
  { value: 'converging', labelKey: 'portfolio.filterConverging' },
  { value: 'idle', labelKey: 'portfolio.filterIdle' },
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
  const t = useTranslations('home');
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
            {project.currentStage ?? t('portfolio.noStage')}
            <i>·</i>
            <code>{hash}</code>
          </span>
        </div>
        <span className="v2-products-status">{pulseCopy(project.pulse)}</span>
      </div>

      <div className="v2-products-body">
        <div className="v2-products-field">
          <span className="v2-products-label">{t('portfolio.labelRisk')}</span>
          <p>{risk || t('portfolio.noRisk')}</p>
        </div>
        <div className="v2-products-field">
          <span className="v2-products-label">{t('portfolio.labelNextMove')}</span>
          <p>{nextStep || t('portfolio.decideNextMove')}</p>
        </div>
      </div>

      <div className="v2-products-foot">
        <span className="v2-products-time">{project.analyzedAt ? t('portfolio.timeAgo', { time: relTimeShort(project.analyzedAt, now) }) : t('portfolio.neverAnalyzed')}</span>
        <Link href={`/projects/${project.id}`} className="v2-products-open">{t('portfolio.open')}</Link>
      </div>
    </article>
  );
}

export default function HomePortfolio({ projects, loading }: Props) {
  const t = useTranslations('home');
  const [filter, setFilter] = useState<FilterKey>('all');
  // Reference timestamp for "time ago" labels — captured outside render
  // (initializer + effect) so render stays pure; refreshes when the
  // projects list changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
  }, [projects]);

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
        <div className="v2-sec-idx" aria-label={t('portfolio.sectionAria')}>
          <span className="v2-sec-idx-num">03</span>
          <span className="v2-sec-idx-lab">{t('portfolio.products')}</span>
        </div>
        <div className="v2-products-summary" aria-label={t('portfolio.summaryAria')}>
          <span><strong>{stats.needsAttention}</strong> {t('portfolio.needAttention')}</span>
          <span><strong>{stats.moving}</strong> {t('portfolio.moving')}</span>
          <span><strong>{stats.idle}</strong> {t('portfolio.idle')}</span>
        </div>
        <Link href="/projects" className="v2-products-all">{t('portfolio.allProducts')}</Link>
      </header>

      {!loading && projects.length > 0 && (
        <div className="v2-products-filters" aria-label={t('portfolio.filterAria')}>
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
                <span>{t(f.labelKey)}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>
      )}

      <div className="v2-products-shell">
        {loading ? (
          <div className="v2-products-skel" aria-busy="true" aria-live="polite">
            <Skeleton height={220} radius={10} />
            <Skeleton height={220} radius={10} />
            <Skeleton height={220} radius={10} />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon="▢"
            title={t('portfolio.emptyNoProductsTitle')}
            description={t('portfolio.emptyNoProductsDesc')}
            action={
              <Button asChild variant="primary" size="sm">
                <Link href="/projects">{t('portfolio.addProduct')}</Link>
              </Button>
            }
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            compact
            icon="⊘"
            title={t('portfolio.emptyNoStatusTitle')}
            description={t('portfolio.emptyNoStatus')}
            action={
              <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                {t('portfolio.showAll')}
              </Button>
            }
          />
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
    transition: background var(--dur-fast) ease, transform var(--dur-fast) ease, border-color var(--dur-fast) ease;
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
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease, background var(--dur-fast) ease;
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
    transition: transform var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .v2-products-open:hover {
    transform: translateY(-1px);
    background: rgba(var(--signature-rgb), 0.08);
  }

  /* Skeleton grid — shimmer comes from the shared .ui-skeleton primitive;
     this wrapper only owns the responsive column layout. */
  .v2-products-skel {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
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
