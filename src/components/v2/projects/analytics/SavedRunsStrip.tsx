'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { AnalyticsInsights, SavedAnalyticsInsight } from './types';
import { PERF_COLOR, PERF_LABEL_KEY, cleanText } from './utils';

interface Props {
  runs: SavedAnalyticsInsight[];
  activeId: string | null;
  onPick: (run: SavedAnalyticsInsight, insights: AnalyticsInsights) => void;
}

// Horizontal-scroll timeline of past mentor reads. Each card shows the
// timestamp, days window, perf badge, and a clamped 3-line summary. Click
// loads that run into the MentorRead panel above.
export default function SavedRunsStrip({ runs, activeId, onPick }: Props) {
  const t = useTranslations('analytics');
  const locale = useLocale();
  if (runs.length === 0) return null;
  return (
    <section className="v2-an-history">
      <div className="v2-an-history-head">
        <span className="recgon-label v2-block-eye">{t('savedRuns.heading')}</span>
        <span className="v2-an-chart-meta">{t('savedRuns.count', { count: runs.length })}</span>
      </div>
      <div className="v2-an-history-strip">
        {runs.slice(0, 12).map((run) => {
          const isActive = activeId === run.id;
          const summary = run.insights?.summary || '—';
          const perf = run.insights?.overallPerformance;
          return (
            <button
              key={run.id}
              type="button"
              className={`v2-an-history-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onPick(run, run.insights)}
              title={t('savedRuns.loadTitle')}
            >
              <div className="v2-an-history-row-top">
                <span className="v2-an-history-time">
                  {new Date(run.createdAt).toLocaleString(locale, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="v2-an-history-days">{t('savedRuns.days', { days: run.days })}</span>
              </div>
              {perf && (
                <span
                  className="v2-an-history-perf"
                  style={{ color: PERF_COLOR[perf] ?? 'var(--txt-faint)' }}
                >
                  {PERF_LABEL_KEY[perf] ? t(PERF_LABEL_KEY[perf]) : perf}
                </span>
              )}
              <span className="v2-an-history-summary">{cleanText(summary)}</span>
              <span
                className="v2-an-history-source"
                style={{ color: run.source === 'terminal' ? 'var(--signature)' : 'var(--txt-faint)' }}
              >
                {run.source}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
