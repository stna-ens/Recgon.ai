'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui';

// First-paint skeleton. Mirrors the new shape: header + 5 tile cards +
// a chart card placeholder + a stage progress bar. Shimmer comes from the
// shared <Skeleton> primitive (.ui-skeleton) — no bespoke keyframes.
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
          <div key={i} className="glass-card is-static is-tight v2-an-tile">
            <Skeleton width="40%" height={11} />
            <Skeleton width="60%" height={22} />
          </div>
        ))}
      </div>
      <div className="glass-card is-static v2-an-chart-wrap">
        <Skeleton width="100%" height={248} radius={8} />
      </div>
      <div className="v2-an-stage">
        <span className="recgon-label">{t('skeleton.fetching')}</span>
        <div className="v2-an-stage-bar" />
      </div>
    </div>
  );
}
