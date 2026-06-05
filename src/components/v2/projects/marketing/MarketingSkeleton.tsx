'use client';

import { useTranslations } from 'next-intl';

// First-paint skeleton. Header eyebrow + loading hero, then a tall setup
// placeholder. Mirrors AnalyticsSkeleton in shape and animation.
export default function MarketingSkeleton() {
  const t = useTranslations('marketing');
  return (
    <div className="v2-m">
      <header className="v2-m-head">
        <div>
          <span className="recgon-label v2-m-eye">{t('eyebrow')}</span>
          <h2 className="v2-m-hero">
            <span>{t('hero.loadingLead')}</span>
          </h2>
        </div>
      </header>
      <div className="glass-card is-static v2-m-skel-tall" />
    </div>
  );
}
