'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui';
import {
  cleanText,
  relTimeShort,
  pulseCopy,
  priority,
  projectInitial,
} from '../utils';
import type { PortfolioRow } from '../HomePortfolio';
import type { RowMeta, Ownership } from './PortfolioRows';

interface Props {
  projects: PortfolioRow[];
  meta: Record<string, RowMeta>;
  loading: boolean;
}

export function isTriage(p: PortfolioRow): boolean {
  return p.pulse === 'drifting' || p.pulse === 'stuck';
}

export function pickFeatured(projects: PortfolioRow[]): PortfolioRow[] {
  return [...projects]
    .filter(isTriage)
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, 3);
}

function ownershipShort(
  o: Ownership | undefined,
  teamName: string | null | undefined,
  t: ReturnType<typeof useTranslations<'projects'>>,
): string | null {
  if (o === 'mine') return t('featured.own.private');
  if (o === 'shared-by-me') return teamName ? t('featured.own.sharedTeam', { team: teamName }) : t('featured.own.shared');
  if (o === 'from-team') return teamName ? t('featured.own.fromTeam', { team: teamName }) : t('featured.own.fromTeamGeneric');
  return null;
}

export default function FeaturedNeedsAttention({ projects, meta, loading }: Props) {
  const t = useTranslations('projects');
  const triage = useMemo(() => pickFeatured(projects), [projects]);
  // Reference timestamp for "time ago" labels — captured outside render
  // (initializer + effect) so render stays pure; refreshes when the
  // projects list changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
  }, [projects]);

  if (loading) {
    return (
      <section className="v2-fnp">
        <div className="v2-fnp-skel">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width="100%" height={168} radius={10} />
          ))}
        </div>
        <style>{stylesheet}</style>
      </section>
    );
  }

  if (triage.length === 0) {
    return (
      <section className="v2-fnp">
        <p className="v2-fnp-clear">{t('featured.allHealthy')}</p>
        <style>{stylesheet}</style>
      </section>
    );
  }

  return (
    <section className="v2-fnp">
      <div className="v2-fnp-grid">
        {triage.map((p) => {
          const risk = cleanText(p.topRisk);
          const nextStep = cleanText(p.topNextStep);
          const m = meta[p.id] ?? {};
          const ownerLabel = ownershipShort(m.ownership, m.teamName, t);
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="glass-card is-static v2-fnp-card" data-pulse={p.pulse}>
              <div className="v2-fnp-card-head">
                <span className="v2-fnp-logo">
                  {p.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element -- user-supplied logo URL; hosts can't be enumerated for next/image
                    ? <img src={p.logoUrl} alt="" className="v2-fnp-logo-img"
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).textContent = projectInitial(p.name); }} />
                    : projectInitial(p.name)}
                </span>
                <h3 className="v2-fnp-name">{p.name}</h3>
                <span className="v2-fnp-status" data-pulse={p.pulse}>{pulseCopy(p.pulse).toLowerCase()}</span>
              </div>

              <div className="v2-fnp-meta-line">
                {p.currentStage && <span className="v2-fnp-stage">{p.currentStage}</span>}
                {ownerLabel && (
                  <>
                    {p.currentStage && <span className="v2-fnp-sep">·</span>}
                    <span className={`v2-fnp-own v2-fnp-own-${m.ownership}`}>{ownerLabel}</span>
                  </>
                )}
              </div>

              <div className="v2-fnp-body">
                <p className="v2-fnp-line">
                  <span className="v2-fnp-key">{t('featured.riskLabel')}</span>{' '}
                  {risk || t('featured.riskFallback')}
                </p>
                <p className="v2-fnp-line">
                  <span className="v2-fnp-key">{t('featured.nextLabel')}</span>{' '}
                  {nextStep || t('featured.nextFallback')}
                </p>
              </div>

              <div className="v2-fnp-foot">
                <span className="v2-fnp-time">
                  {p.analyzedAt ? t('featured.analyzedAgo', { time: relTimeShort(p.analyzedAt, now) }) : t('featured.neverAnalyzed')}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <style>{stylesheet}</style>
    </section>
  );
}

const stylesheet = `
  .v2-fnp { display: block; }

  .v2-fnp-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 1080px) {
    .v2-fnp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .v2-fnp-grid { grid-template-columns: 1fr; }
  }

  /* Cards compose .glass-card (frosted gradient + signature pink border)
     so they match the rest of the app's panel material. We just override
     padding/layout for our content density. */
  .v2-fnp-card.glass-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px !important;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
    transition: transform var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow var(--dur-base) ease, border-color var(--dur-base) ease;
  }
  /* v1-style lift on hover: -2px translate, signature pink border tint,
     soft signature pink shadow. */
  .v2-fnp-card.glass-card:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--signature-rgb), 0.30);
    box-shadow: 0 12px 28px -10px rgba(var(--signature-rgb), 0.20);
  }

  .v2-fnp-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .v2-fnp-logo {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    overflow: hidden;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--signature-rgb), 0.18);
    border: 1px solid rgba(var(--signature-rgb), 0.22);
    color: var(--txt-pure);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 800;
  }
  .v2-fnp-logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .v2-fnp-name {
    margin: 0;
    color: var(--txt-pure);
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.005em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }
  .v2-fnp-status {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: var(--txt-faint);
    flex-shrink: 0;
  }
  .v2-fnp-status[data-pulse='drifting']  { color: var(--signature); }
  .v2-fnp-status[data-pulse='stuck']     { color: var(--warning, #d97706); }

  .v2-fnp-meta-line {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: var(--txt-faint);
    text-transform: lowercase;
    letter-spacing: 0.2px;
    margin-top: -4px;
  }
  .v2-fnp-stage {
    color: var(--txt-muted);
    font-weight: 700;
  }
  .v2-fnp-sep { opacity: 0.45; }
  .v2-fnp-own {
    color: var(--txt-faint);
    font-weight: 700;
  }
  .v2-fnp-own-shared-by-me  { color: var(--signature); }
  .v2-fnp-own-from-team     { color: #93c5fd; }

  .v2-fnp-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    margin-top: 2px;
  }
  .v2-fnp-line {
    margin: 0;
    color: var(--txt-muted);
    font-size: 13px;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .v2-fnp-key {
    color: var(--txt-pure);
    font-weight: 650;
  }

  .v2-fnp-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 4px;
  }
  .v2-fnp-time {
    color: var(--txt-faint);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.2px;
  }
  .v2-fnp-clear {
    margin: 0;
    padding: 14px 16px;
    color: var(--txt-muted);
    font-size: 13px;
    border: 1px dashed var(--rule);
    border-radius: 10px;
  }

  .v2-fnp-skel {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  @media (max-width: 1080px) {
    .v2-fnp-skel { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 720px) {
    .v2-fnp-skel { grid-template-columns: 1fr; }
  }
`;
