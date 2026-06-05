'use client';

import { useTranslations } from 'next-intl';

export default function MarketingEmpty() {
  const t = useTranslations('marketing');
  return (
    <div className="v2-m">
      <header className="v2-m-head">
        <div>
          <span className="recgon-label v2-m-eye">{t('eyebrow')}</span>
          <h2 className="v2-m-hero">
            <span>{t('empty.heroLead')}</span>
          </h2>
          <p className="v2-m-sub">
            {t('empty.heroSub')}
          </p>
        </div>
      </header>

      <div className="v2-m-empty">
        <span className="v2-m-empty-icon" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
          </svg>
        </span>
        <div>
          <h3>{t('empty.title')}</h3>
          <p>{t('empty.body')}</p>
        </div>
      </div>
    </div>
  );
}
