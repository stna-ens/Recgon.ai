'use client';

import { useTranslations } from 'next-intl';
import type { AnalyticsData, AnalyticsInsights, GAProperty, PropertyConfig } from './types';
import { DAYS_OPTIONS, PERF_COLOR, PERF_LABEL_KEY, fmtTime, propIdOf, type AnalyticsHeroDescriptor } from './utils';

interface Props {
  data: AnalyticsData;
  insights: AnalyticsInsights | null;
  days: number;
  refreshing: boolean;
  isOwner: boolean;
  currentTeamName?: string;
  propertyConfig: PropertyConfig | null;
  availableProperties: GAProperty[];
  hero: AnalyticsHeroDescriptor;
  onChangeDays: (days: number) => void;
  onRefresh: () => void;
  onPickProperty: (propertyId: string) => void;
  onTransferConnection: () => void;
  onDisconnect: () => void;
}

// Hero header. Replaces the old `<h2>12,481 sessions, last 30 days.</h2>`
// with an interpretation-led headline + delta chip. Property meta + perf
// badge + controls (range, refresh, property switcher, scope, disconnect,
// docs link) all live to the right and below.
export default function AnalyticsHeader({
  data,
  insights,
  days,
  refreshing,
  isOwner,
  currentTeamName,
  propertyConfig,
  availableProperties,
  hero,
  onChangeDays,
  onRefresh,
  onPickProperty,
  onTransferConnection,
  onDisconnect,
}: Props) {
  const t = useTranslations('analytics');
  const propertyOptionsForSwitcher = availableProperties.filter((p) => propIdOf(p));
  const perf = insights?.overallPerformance;

  // Resolve the hero descriptor into a lead line + optional delta chip.
  const metric = hero.metricLabelKey ? t(hero.metricLabelKey) : '';
  let heroLead = '';
  let heroDelta = '';
  switch (hero.kind) {
    case 'sessions':
      heroLead = t('hero.sessionsRange', { count: hero.sessions ?? '', range: hero.range ?? '' });
      break;
    case 'metricSteady':
      heroLead = t('hero.metricSteady', { metric, range: hero.range ?? '' });
      break;
    case 'flatDown':
      heroLead = t('hero.flatLeaningDown');
      break;
    case 'metricUp':
      heroLead = t('hero.metricUp', { metric });
      heroDelta = t('hero.delta', { arrow: hero.arrow ?? '', pct: hero.pct ?? '', compare: hero.compareKey ? t(hero.compareKey) : '' });
      break;
    case 'metricDown':
      heroLead = t('hero.metricDown', { metric });
      heroDelta = t('hero.delta', { arrow: hero.arrow ?? '', pct: hero.pct ?? '', compare: hero.compareKey ? t(hero.compareKey) : '' });
      break;
  }

  return (
    <header className="v2-an-head">
      <div>
        <span className="recgon-label v2-eyebrow">{t('eyebrow')}</span>
        <h2 className="v2-an-hero">
          <span>{heroLead}</span>
          {heroDelta && hero.deltaTone && (
            <span className={`v2-an-hero-delta v2-an-hero-delta-${hero.deltaTone}`}>{heroDelta}</span>
          )}
        </h2>
        <p className="v2-an-sub">
          {perf && (
            <span
              className="v2-an-perf"
              style={{ color: PERF_COLOR[perf], borderColor: PERF_COLOR[perf] }}
            >
              {t(PERF_LABEL_KEY[perf])}
            </span>
          )}
          <span className="v2-an-prop">{t('header.property', { id: data.propertyId })}</span>
          {data.fetchedAt && <span className="v2-an-prop">{t('header.fetchedAt', { time: fmtTime(data.fetchedAt) })}</span>}
          {propertyConfig?.ownerUserId && currentTeamName && !isOwner && (
            <span className="v2-an-prop">{t('header.connectedByOwner')}</span>
          )}
        </p>
      </div>

      <div className="v2-an-controls">
        <div className="v2-an-range" role="group" aria-label={t('header.dateRangeAria')}>
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`v2-an-range-btn ${opt.value === days ? 'is-active' : ''}`}
              onClick={() => onChangeDays(opt.value)}
              title={t(opt.longLabelKey)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="v2-btn-tiny"
          onClick={onRefresh}
          disabled={refreshing}
          title={t('header.refreshTitle')}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            aria-hidden="true"
            style={refreshing ? { animation: 'v2anspin 0.8s linear infinite' } : undefined}
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.45" />
          </svg>
          {t('header.refresh')}
        </button>

        {propertyOptionsForSwitcher.length > 1 && (
          <select
            className="v2-an-prop-select"
            defaultValue={data.propertyId}
            onChange={(e) => onPickProperty(e.target.value)}
            aria-label={t('header.propertyAria')}
          >
            {propertyOptionsForSwitcher.map((p) => {
              const id = propIdOf(p);
              return (
                <option key={id} value={id}>
                  {p.displayName ? `${p.displayName} · ${id}` : id}
                </option>
              );
            })}
          </select>
        )}

        {isOwner && propertyConfig?.hasCredentials && currentTeamName && (
          <button
            type="button"
            className="v2-btn-tiny"
            onClick={onTransferConnection}
            title={t('header.moveScopeTitle', { team: currentTeamName })}
          >
            {t('header.moveScope')}
          </button>
        )}

        {isOwner && propertyConfig?.hasCredentials && (
          <button
            type="button"
            className="v2-btn-tiny v2-an-danger"
            onClick={onDisconnect}
            title={t('header.disconnectTitle')}
          >
            {t('header.disconnect')}
          </button>
        )}

        <a
          href="https://support.google.com/analytics/answer/9304153"
          target="_blank"
          rel="noopener noreferrer"
          className="v2-an-link"
        >
          {t('docsLink')}
        </a>
      </div>
    </header>
  );
}
