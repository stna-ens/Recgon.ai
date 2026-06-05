'use client';

import { useTranslations } from 'next-intl';
import type { PropertyConfig } from './types';
import { parseAnalyticsError } from './utils';

interface Props {
  error: string;
  isOwner: boolean;
  propertyConfig: PropertyConfig | null;
  onRetry: () => void;
  onDisconnect: () => void;
}

// Error card. Uses parseAnalyticsError to convert a raw GA4 message into a
// titled set of actionable steps. Generic errors fall back to a single
// step paragraph.
export default function AnalyticsError({ error, isOwner, propertyConfig, onRetry, onDisconnect }: Props) {
  const t = useTranslations('analytics');
  const tc = useTranslations('common');
  const { titleKey, stepKeys, rawStep } = parseAnalyticsError(error);
  const title = t(titleKey);
  // Localized step list, or — for the fallback branch — the raw server message.
  const steps = stepKeys.length > 0 ? stepKeys.map((k) => t(k)) : [rawStep ?? error];
  return (
    <div className="v2-an">
      <header className="v2-an-head">
        <div>
          <span className="recgon-label v2-eyebrow">{t('eyebrow')}</span>
          <h2 className="v2-an-title">
            <span className="v2-pink">{t('error.titlePrefix')}</span> {t('error.titleSuffix')}
          </h2>
          <p className="v2-an-sub">
            <span className="v2-an-prop">{error}</span>
          </p>
        </div>
        <a
          href="https://support.google.com/analytics/answer/9304153"
          target="_blank"
          rel="noopener noreferrer"
          className="v2-an-link"
        >
          {t('helpLink')}
        </a>
      </header>

      <div className="v2-an-err-card">
        <p className="v2-an-err-title">! {title}</p>
        {steps.length > 1 ? (
          <ol className="v2-an-err-steps">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        ) : (
          <p className="v2-an-err-step">{steps[0]}</p>
        )}
        <div className="v2-an-err-actions">
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onRetry}>
            {tc('retry')}
          </button>
          {propertyConfig?.hasCredentials && isOwner && (
            <button type="button" className="v2-btn v2-btn-ghost" onClick={onDisconnect}>
              {t('error.disconnect')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
