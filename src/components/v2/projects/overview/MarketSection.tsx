'use client';

import type { ProductAnalysis } from './types';
import { extractTags, splitHeadline } from './utils';

export default function MarketSection({ analysis }: { analysis: ProductAnalysis }) {
  const a = analysis;
  const hasContent =
    !!a.marketOpportunity ||
    (a.competitors && a.competitors.length > 0) ||
    (a.competitorInsights && a.competitorInsights.length > 0);
  if (!hasContent) return null;

  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <span className="recgon-label v2-eyebrow">› market</span>
      </div>

      {a.marketOpportunity && (() => {
        const split = splitHeadline(a.marketOpportunity);
        const SIGNAL_DICT = [
          'significant', 'growing', 'large', 'expanding', 'emerging',
          'high demand', 'demand', 'opportunity', 'edge', 'competitive',
          'niche', 'specialized', 'integrated', 'underserved', 'underserve',
          'streamline', 'gap', 'whitespace', 'scale', 'scalable',
        ];
        const signals = extractTags(a.marketOpportunity, SIGNAL_DICT);
        return (
          <div className="glass-card is-static is-roomy v2-mkt">
            <div className="v2-mkt-grid">
              <div className="v2-mkt-prose">
                <span className="recgon-label v2-block-eye">market opportunity</span>
                <p className="v2-mkt-headline">{split.headline}</p>
                {split.rest && <p className="v2-mkt-body">{split.rest}</p>}
              </div>
              {signals.length > 0 && (
                <div className="v2-mkt-side">
                  <div className="v2-mkt-signals">
                    <span className="recgon-label v2-block-eye">signals detected</span>
                    <div className="v2-mkt-signal-list">
                      {signals.map((s) => (
                        <span key={s} className="v2-mkt-signal">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {a.competitorInsights && a.competitorInsights.length > 0 ? (
        <div className="v2-batt-wrap">
          <div className="v2-batt-head">
            <span className="recgon-label v2-block-eye">competitive battlecards</span>
            <span className="v2-batt-meta">{a.competitorInsights.length} {a.competitorInsights.length === 1 ? 'rival' : 'rivals'} mapped</span>
          </div>
          <div className="v2-batt-grid">
            {a.competitorInsights.map((c, i) => (
              <div key={i} className="glass-card is-static v2-batt-card">
                <div className="v2-batt-card-head">
                  <span className="v2-batt-rank">#{String(i + 1).padStart(2, '0')}</span>
                  <div className="v2-batt-id">
                    <span className="v2-batt-name">{c.name}</span>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer" className="v2-batt-visit">visit ↗</a>
                    )}
                  </div>
                  {c.messagingTone && (
                    <span className="v2-batt-tone">tone · {c.messagingTone}</span>
                  )}
                </div>
                {c.summary && (
                  <p className="v2-batt-summary">{c.summary}</p>
                )}
                <div className="v2-batt-vs">
                  {c.keyFeatures && c.keyFeatures.length > 0 && (
                    <div className="v2-batt-col v2-batt-pro">
                      <div className="v2-batt-col-head">
                        <span className="v2-batt-col-glyph">+</span>
                        <span className="v2-batt-col-label">their strengths</span>
                        <span className="v2-batt-col-count">{c.keyFeatures.length}</span>
                      </div>
                      <ul className="v2-batt-items">
                        {c.keyFeatures.map((f, j) => <li key={j}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="v2-batt-divider" aria-hidden="true" />
                  {c.weaknesses && c.weaknesses.length > 0 && (
                    <div className="v2-batt-col v2-batt-con">
                      <div className="v2-batt-col-head">
                        <span className="v2-batt-col-glyph">−</span>
                        <span className="v2-batt-col-label">their gaps</span>
                        <span className="v2-batt-col-count">{c.weaknesses.length}</span>
                      </div>
                      <ul className="v2-batt-items">
                        {c.weaknesses.map((w, j) => <li key={j}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                {c.differentiator && (
                  <div className="v2-batt-edge">
                    <span className="v2-batt-edge-label">your edge</span>
                    <span className="v2-batt-edge-text">{c.differentiator}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : a.competitors && a.competitors.length > 0 ? (
        <div className="v2-batt-wrap">
          <div className="v2-batt-head">
            <span className="recgon-label v2-block-eye">competitors</span>
            <span className="v2-batt-meta">{a.competitors.length} mapped</span>
          </div>
          <div className="v2-comp-lite-grid">
            {a.competitors.map((c, i) => {
              const pivotMatch = c.differentiator.match(/(.+?)(?:\b(?:lack|but|however|do not offer|don't offer|while|whereas|are limited)\b\s*)(.+)/i);
              const theirFocus = pivotMatch ? pivotMatch[1].replace(/[,;]\s*$/, '').trim() : null;
              const yourEdge = pivotMatch ? pivotMatch[2].trim() : c.differentiator;
              return (
                <div key={i} className="glass-card is-static v2-comp-card">
                  <div className="v2-comp-card-head">
                    <span className="v2-comp-card-rank">#{String(i + 1).padStart(2, '0')}</span>
                    <div className="v2-comp-card-id">
                      <span className="v2-comp-card-name">{c.name}</span>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noreferrer" className="v2-batt-visit">visit ↗</a>
                      )}
                    </div>
                  </div>
                  {theirFocus && (
                    <div className="v2-comp-card-row">
                      <span className="v2-comp-card-tag v2-comp-card-tag-them">them</span>
                      <p className="v2-comp-card-text">{theirFocus}</p>
                    </div>
                  )}
                  <div className="v2-comp-card-row v2-comp-card-row-edge">
                    <span className="v2-comp-card-tag v2-comp-card-tag-you">your edge</span>
                    <p className="v2-comp-card-text">{yourEdge}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
