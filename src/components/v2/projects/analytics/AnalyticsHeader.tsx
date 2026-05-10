'use client';

import type { AnalyticsData, AnalyticsInsights, GAProperty, PropertyConfig } from './types';
import { DAYS_OPTIONS, PERF_COLOR, PERF_LABEL, fmtTime, propIdOf } from './utils';

interface Props {
  data: AnalyticsData;
  insights: AnalyticsInsights | null;
  days: number;
  refreshing: boolean;
  isOwner: boolean;
  currentTeamName?: string;
  propertyConfig: PropertyConfig | null;
  availableProperties: GAProperty[];
  hero: { lead: string; metric?: string; deltaText?: string; deltaTone?: 'success' | 'danger' | 'faint' };
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
  const propertyOptionsForSwitcher = availableProperties.filter((p) => propIdOf(p));
  const perf = insights?.overallPerformance;

  return (
    <header className="v2-an-head">
      <div>
        <span className="recgon-label v2-eyebrow">› analytics</span>
        <h2 className="v2-an-hero">
          <span>{hero.lead}</span>
          {hero.deltaText && hero.deltaTone && (
            <span className={`v2-an-hero-delta v2-an-hero-delta-${hero.deltaTone}`}>{hero.deltaText}</span>
          )}
        </h2>
        <p className="v2-an-sub">
          {perf && (
            <span
              className="v2-an-perf"
              style={{ color: PERF_COLOR[perf], borderColor: PERF_COLOR[perf] }}
            >
              {PERF_LABEL[perf]}
            </span>
          )}
          <span className="v2-an-prop">property {data.propertyId}</span>
          {data.fetchedAt && <span className="v2-an-prop">· fetched {fmtTime(data.fetchedAt)}</span>}
          {propertyConfig?.ownerUserId && currentTeamName && !isOwner && (
            <span className="v2-an-prop">· connected by team owner</span>
          )}
        </p>
      </div>

      <div className="v2-an-controls">
        <div className="v2-an-range" role="group" aria-label="Date range">
          {DAYS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`v2-an-range-btn ${opt.value === days ? 'is-active' : ''}`}
              onClick={() => onChangeDays(opt.value)}
              title={opt.longLabel}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="v2-btn-tiny"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh data"
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
          refresh
        </button>

        {propertyOptionsForSwitcher.length > 1 && (
          <select
            className="v2-an-prop-select"
            defaultValue={data.propertyId}
            onChange={(e) => onPickProperty(e.target.value)}
            aria-label="Switch GA4 property"
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
            title={`Move this connection between team "${currentTeamName}" and personal`}
          >
            move scope
          </button>
        )}

        {isOwner && propertyConfig?.hasCredentials && (
          <button
            type="button"
            className="v2-btn-tiny v2-an-danger"
            onClick={onDisconnect}
            title="Disconnect GA4 from this team"
          >
            disconnect
          </button>
        )}

        <a
          href="https://support.google.com/analytics/answer/9304153"
          target="_blank"
          rel="noopener noreferrer"
          className="v2-an-link"
        >
          GA4 docs →
        </a>
      </div>
    </header>
  );
}
