'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsInsights } from './types';
import { cleanText } from './utils';

interface Props {
  insights: AnalyticsInsights;
  regenerating: boolean;
  onRegenerate: () => void;
}

type TabKey = 'key' | 'warn' | 'opp' | 'rec';

interface TabDef {
  key: TabKey;
  label: string;
  marker: string;
  markerColor?: string;
  rendered: 'marker' | 'numbered';
  items: string[];
}

// Mentor read panel. Summary + topWin/topConcern duo are always visible.
// The four list types collapse into tabs to keep the section compact.
// Defaults to whichever tab has the most items.
export default function MentorRead({ insights, regenerating, onRegenerate }: Props) {
  const tabs: TabDef[] = useMemo(
    () => [
      { key: 'key',  label: 'key insights',  marker: '›', rendered: 'marker', items: insights.keyInsights ?? [] },
      { key: 'warn', label: 'warnings',      marker: '!', markerColor: 'var(--danger)', rendered: 'marker', items: insights.warnings ?? [] },
      { key: 'opp',  label: 'opportunities', marker: '↑', markerColor: 'var(--success)', rendered: 'marker', items: insights.opportunities ?? [] },
      { key: 'rec',  label: 'next steps',    marker: '',  rendered: 'numbered', items: insights.recommendations ?? [] },
    ],
    [insights],
  );

  const defaultTab: TabKey = useMemo(() => {
    const withItems = tabs.filter((t) => t.items.length > 0);
    if (withItems.length === 0) return 'key';
    return withItems.sort((a, b) => b.items.length - a.items.length)[0].key;
  }, [tabs]);

  const [active, setActive] = useState<TabKey>(defaultTab);
  useEffect(() => { setActive(defaultTab); }, [defaultTab]);

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];
  const hasAnyList = tabs.some((t) => t.items.length > 0);

  return (
    <section className="glass-card is-static v2-an-insight">
      <div className="v2-an-insight-head">
        <span className="recgon-label v2-block-eye">› recgon insights</span>
        <button
          type="button"
          className="v2-btn-tiny"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? <><span className="v2-an-spinner" /> regenerating…</> : '↻ re-analyze'}
        </button>
      </div>

      <p className="v2-an-insight-summary">{cleanText(insights.summary)}</p>

      {(insights.topWin || insights.topConcern) && (
        <div className="v2-an-duo">
          {insights.topWin && (
            <div className="v2-an-duo-card v2-duo-win">
              <span className="recgon-label v2-block-eye" style={{ color: 'var(--success)' }}>top win</span>
              <p className="v2-an-prose">{cleanText(insights.topWin)}</p>
            </div>
          )}
          {insights.topConcern && (
            <div className="v2-an-duo-card v2-duo-concern">
              <span className="recgon-label v2-block-eye" style={{ color: 'var(--danger)' }}>top concern</span>
              <p className="v2-an-prose">{cleanText(insights.topConcern)}</p>
            </div>
          )}
        </div>
      )}

      {hasAnyList && (
        <>
          <div className="v2-an-tabs" role="tablist">
            {tabs.map((t) => {
              const disabled = t.items.length === 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`v2-an-tab ${active === t.key ? 'is-active' : ''}`}
                  onClick={() => setActive(t.key)}
                  disabled={disabled}
                  role="tab"
                  aria-selected={active === t.key}
                >
                  {t.label}
                  {t.items.length > 0 && <span className="v2-an-tab-count">{t.items.length}</span>}
                </button>
              );
            })}
          </div>
          <div className="v2-an-tab-body" key={active}>
            {activeTab.items.length === 0 ? (
              <p className="v2-an-prose">no items in this tab.</p>
            ) : activeTab.rendered === 'marker' ? (
              <ul className="v2-marker-list">
                {activeTab.items.map((s, i) => (
                  <li key={i}>
                    <span className="v2-marker" style={activeTab.markerColor ? { color: activeTab.markerColor } : undefined}>
                      {activeTab.marker}
                    </span>
                    <span>{cleanText(s)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ol className="v2-num-list">
                {activeTab.items.map((s, i) => (
                  <li key={i}>
                    <span className="v2-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{cleanText(s)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}
