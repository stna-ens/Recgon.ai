'use client';

import type { ProductAnalysis, SWOT } from './types';

export default function SwotMatrixSection({ swot, projectName }: { swot: SWOT; projectName: ProductAnalysis['name'] }) {
  if (!swot) return null;
  if (!swot.strengths.length && !swot.weaknesses.length && !swot.opportunities.length && !swot.threats.length) return null;
  return (
    <section className="v2-section">
      <div className="v2-section-head">
        <span className="recgon-label v2-eyebrow">› swot matrix</span>
      </div>
      <div className="glass-card is-static is-roomy v2-swot">
        <div className="v2-swot-grid">
          <div className="v2-swot-quad v2-swot-s">
            <div className="v2-swot-head">
              <span className="v2-swot-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1.5L13.5 4v4c0 3-2.5 5.5-5.5 6.5C5 13.5 2.5 11 2.5 8V4L8 1.5z" />
                  <path d="M5.5 8l2 2 3.5-4" />
                </svg>
              </span>
              <span className="v2-swot-name">strengths</span>
              <span className="v2-swot-count">{swot.strengths.length}</span>
            </div>
            <ul className="v2-swot-items">
              {swot.strengths.map((it, i) => (
                <li key={i}><span className="v2-swot-bullet">+</span>{it}</li>
              ))}
            </ul>
          </div>
          <div className="v2-swot-quad v2-swot-w">
            <div className="v2-swot-head">
              <span className="v2-swot-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" />
                  <line x1="5" y1="8" x2="11" y2="8" />
                </svg>
              </span>
              <span className="v2-swot-name">weaknesses</span>
              <span className="v2-swot-count">{swot.weaknesses.length}</span>
            </div>
            <ul className="v2-swot-items">
              {swot.weaknesses.map((it, i) => (
                <li key={i}><span className="v2-swot-bullet">−</span>{it}</li>
              ))}
            </ul>
          </div>
          <div className="v2-swot-quad v2-swot-o">
            <div className="v2-swot-head">
              <span className="v2-swot-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6.5" />
                  <circle cx="8" cy="8" r="3.5" />
                  <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="v2-swot-name">opportunities</span>
              <span className="v2-swot-count">{swot.opportunities.length}</span>
            </div>
            <ul className="v2-swot-items">
              {swot.opportunities.map((it, i) => (
                <li key={i}><span className="v2-swot-bullet">↗</span>{it}</li>
              ))}
            </ul>
          </div>
          <div className="v2-swot-quad v2-swot-t">
            <div className="v2-swot-head">
              <span className="v2-swot-glyph" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2L14.5 13.5h-13L8 2z" />
                  <line x1="8" y1="6.5" x2="8" y2="10" />
                  <circle cx="8" cy="11.8" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="v2-swot-name">threats</span>
              <span className="v2-swot-count">{swot.threats.length}</span>
            </div>
            <ul className="v2-swot-items">
              {swot.threats.map((it, i) => (
                <li key={i}><span className="v2-swot-bullet">⚠</span>{it}</li>
              ))}
            </ul>
          </div>
          <div className="v2-swot-hub" aria-hidden="true">
            <span className="v2-swot-hub-text">{(projectName ?? '').toLowerCase()}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
