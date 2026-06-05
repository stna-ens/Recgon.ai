'use client';

import { useTranslations } from 'next-intl';

// First-paint skeleton. Mirrors the new shape: header + 5 tile cards +
// a chart card placeholder + a stage progress bar.
export default function AnalyticsSkeleton() {
  const t = useTranslations('analytics');
  return (
    <div className="v2-an">
      <header className="v2-an-head">
        <div>
          <span className="recgon-label v2-eyebrow">{t('eyebrow')}</span>
          <h2 className="v2-an-title">{t('skeleton.loading')}</h2>
        </div>
      </header>
      <div className="v2-an-grid">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="glass-card is-static is-tight v2-an-tile v2-an-skel" />
        ))}
      </div>
      <div className="glass-card is-static v2-an-chart-skel" />
      <div className="v2-an-stage">
        <span className="recgon-label">{t('skeleton.fetching')}</span>
        <div className="v2-an-stage-bar" />
      </div>
    </div>
  );
}
