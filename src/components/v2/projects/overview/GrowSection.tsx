'use client';

import { useTranslations } from 'next-intl';
import type { ProductAnalysis } from './types';
import { splitHeadline } from './utils';

export default function GrowSection({ analysis }: { analysis: ProductAnalysis }) {
  const t = useTranslations('projects');
  const a = analysis;
  if (!a.businessModel && !a.gtmStrategy) return null;

  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <span className="recgon-label v2-eyebrow">{t('grow.eyebrow')}</span>
      </div>

      <div className="v2-grow">
        {a.businessModel && (() => {
          const split = splitHeadline(a.businessModel);
          return (
            <div className="glass-card is-static is-roomy v2-grow-rev">
              <div className="v2-grow-rev-head">
                <span className="recgon-label v2-block-eye">{t('grow.revenueModel')}</span>
              </div>
              <p className="v2-grow-headline">{split.headline}</p>
              {split.rest && <p className="v2-grow-body">{split.rest}</p>}

              {a.revenueStreams && a.revenueStreams.length > 0 && (
                <div className="v2-grow-streams">
                  <span className="recgon-label v2-block-eye">{t('grow.revenueStreams')}</span>
                  <div className="v2-grow-stream-flow">
                    {a.revenueStreams.map((s, i) => (
                      <div key={s} className="v2-grow-stream">
                        <span className="v2-grow-stream-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="v2-grow-stream-text">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {a.pricingSuggestion && (
                <div className="v2-grow-pricing">
                  <span className="recgon-label v2-block-eye">{t('grow.pricing')}</span>
                  <div className="v2-grow-price-card">
                    <span className="v2-grow-price-glyph" aria-hidden="true">$</span>
                    <p className="v2-grow-price-text">{a.pricingSuggestion}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {a.gtmStrategy && (() => {
          const split = splitHeadline(a.gtmStrategy);
          return (
            <div className="glass-card is-static is-roomy v2-grow-gtm">
              <div className="v2-grow-rev-head">
                <span className="recgon-label v2-block-eye">{t('grow.goToMarket')}</span>
              </div>
              <p className="v2-grow-headline">{split.headline}</p>
              {split.rest && <p className="v2-grow-body">{split.rest}</p>}

              {a.earlyAdopterChannels && a.earlyAdopterChannels.length > 0 && (
                <div className="v2-grow-channels">
                  <div className="v2-grow-sub-head">
                    <span className="recgon-label v2-block-eye">{t('grow.adoptionFunnel')}</span>
                    <span className="v2-grow-sub-meta">{t('grow.channels', { count: a.earlyAdopterChannels.length })}</span>
                  </div>
                  <ol className="v2-funnel">
                    {a.earlyAdopterChannels.map((c, i) => {
                      const widthPct = 100 - i * (60 / Math.max(1, a.earlyAdopterChannels!.length));
                      return (
                        <li key={i} className="v2-funnel-step" style={{ ['--width' as string]: `${widthPct}%` }}>
                          <span className="v2-funnel-bar" />
                          <span className="v2-funnel-num">S{String(i + 1).padStart(2, '0')}</span>
                          <span className="v2-funnel-text">{c}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

            </div>
          );
        })()}
      </div>

      {a.growthMetrics && a.growthMetrics.length > 0 && (
        <div className="glass-card is-static is-roomy v2-kpi-card">
          <div className="v2-grow-sub-head">
            <span className="recgon-label v2-block-eye">{t('grow.growthMetrics')}</span>
            <span className="v2-grow-sub-meta">{t('grow.kpis', { count: a.growthMetrics.length })}</span>
          </div>
          <div className="v2-kpi-grid">
            {a.growthMetrics.map((m, i) => (
              <div key={i} className="v2-kpi-tile">
                <span className="v2-kpi-id">K{String(i + 1).padStart(2, '0')}</span>
                <span className="v2-kpi-text">{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
