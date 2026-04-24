'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import { buildFeedbackActionLanes } from '@/lib/feedbackContent';

interface FeedbackPanelProps {
  sentiment: string;
  summary?: string;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  feedbackCount?: number;
  analyzedAtLabel?: string;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: 'var(--success)',
  negative: 'var(--danger)',
  neutral: 'var(--txt-muted)',
  mixed: 'var(--warning)',
};

const LANE_TONE: Record<string, { color: string; emptyText: string }> = {
  fix: { color: 'var(--danger)', emptyText: 'No urgent bugs surfaced.' },
  build: { color: 'var(--signature)', emptyText: 'No new build requests yet.' },
  protect: { color: 'var(--success)', emptyText: 'No explicit praise in this run.' },
};

const LANE_TITLES = {
  fix: 'Fix now',
  build: 'Build next',
  protect: 'Protect what works',
} as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

function CopyButton({ text, compact = false }: { text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className={`copy-btn${compact ? ' fb-copy-btn--compact' : ''}`}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* noop */
        }
      }}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

interface TriageLaneProps {
  title: string;
  items: string[];
  color: string;
  emptyText: string;
}

function TriageLane({ title, items, color, emptyText }: TriageLaneProps) {
  return (
    <section
      className="fb-triage-lane"
      style={{ '--fb-lane-color': color, borderTopColor: color } as CSSProperties}
    >
      <div className="fb-triage-lane__head">
        <h3 className="fb-triage-lane__title">{title}</h3>
        <span className="fb-triage-lane__count" style={{ color }}>
          {pad2(items.length)}
        </span>
      </div>

      {items.length > 0 ? (
        <ol className="fb-triage-list">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${title}-${index}`} className="fb-triage-item">
              <span className="fb-triage-item__index">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="fb-empty-copy">{emptyText}</p>
      )}
    </section>
  );
}

function SentimentLegend({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  return (
    <div className="fb-sentiment-legend">
      <span>
        <span style={{ color: 'var(--success)' }}>●</span> {positive}% positive
      </span>
      <span>
        <span style={{ color: 'rgba(var(--signature-rgb), 0.8)' }}>●</span>{' '}
        {neutral}% neutral
      </span>
      <span>
        <span style={{ color: 'var(--fb-negative)' }}>●</span> {negative}% negative
      </span>
    </div>
  );
}

export default function FeedbackPanel({
  sentiment,
  summary,
  sentimentBreakdown,
  themes,
  featureRequests,
  bugs,
  praises,
  developerPrompts,
  feedbackCount,
  analyzedAtLabel,
}: FeedbackPanelProps) {
  const sentColor = SENTIMENT_COLOR[sentiment] ?? SENTIMENT_COLOR.mixed;
  const breakdown = sentimentBreakdown ?? { positive: 0, neutral: 100, negative: 0 };
  const actionLanes = buildFeedbackActionLanes({ bugs, featureRequests, praises }, 5);
  const actionLaneMap = new Map(actionLanes.map((lane) => [lane.id, lane]));
  const triageLanes = (['fix', 'build', 'protect'] as const).map((id) => (
    actionLaneMap.get(id) ?? { id, title: LANE_TITLES[id], items: [], tone: id === 'fix' ? 'danger' : id === 'build' ? 'accent' : 'success' }
  ));
  const topPrompt = developerPrompts[0];
  const remainingPrompts = developerPrompts.slice(1, 8);

  const stats = [
    { label: 'signals', value: feedbackCount ?? 0 },
    { label: 'bugs', value: bugs.length },
    { label: 'requests', value: featureRequests.length },
    { label: 'praise', value: praises.length },
  ];

  return (
    <div className="fb-workspace">
      <style>{`
        @keyframes fbSurfaceIn {
          from { opacity: 0; transform: translateY(14px) scale(0.992); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes fbQueueIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fbBarGrow {
          from { transform: scaleX(0); opacity: 0.35; }
          to { transform: scaleX(1); opacity: 1; }
        }
        .fb-workspace {
          display: flex;
          flex-direction: column;
          gap: 18px;
          --fb-negative: #d83d4b;
        }
        .fb-action-card,
        .fb-voice-card {
          padding: 0;
          overflow: visible;
          animation: fbSurfaceIn 0.58s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, background 0.2s ease;
        }
        .fb-action-card {
          position: relative;
          border-color: rgba(var(--signature-rgb), 0.22) !important;
        }
        .fb-workspace .fb-action-card:hover,
        .fb-workspace .fb-voice-card:hover {
          transform: scale(1.015) translateZ(0);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.4), 0 0 32px 4px rgba(var(--signature-rgb), 0.18);
        }
        .fb-workspace .copy-btn {
          float: none;
          white-space: nowrap;
        }
        .fb-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 22px 24px 18px;
          border-bottom: 1px solid rgba(var(--signature-rgb), 0.12);
        }
        .fb-section-title {
          margin: 0;
          font-size: clamp(20px, 2vw, 26px);
          line-height: 1.1;
          font-weight: 650;
          letter-spacing: -0.03em;
          color: var(--txt-pure);
        }
        .fb-section-kicker {
          margin: 0 0 8px;
        }
        .fb-section-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          color: var(--txt-muted);
          font-size: 12px;
          line-height: 1.5;
        }
        .fb-action-count {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.1);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .fb-action-body {
          padding: 22px 24px 24px;
          display: grid;
          grid-template-columns: minmax(0, 1.06fr) minmax(280px, 0.94fr);
          gap: 18px;
          align-items: stretch;
        }
        .fb-next-action {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 22px;
          min-height: 100%;
          padding: 22px;
          border-radius: var(--r-sm);
          background:
            linear-gradient(180deg, rgba(var(--signature-rgb), 0.12), rgba(var(--signature-rgb), 0.03)),
            var(--btn-secondary-bg);
          border: 1px solid rgba(var(--signature-rgb), 0.2);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          transition:
            transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }
        .fb-next-action:hover {
          transform: scale(1.015) translateZ(0);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.4), 0 0 32px 4px rgba(var(--signature-rgb), 0.18);
        }
        .fb-next-action__top {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }
        .fb-next-action__label {
          display: block;
          color: var(--signature);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .fb-next-action__text,
        .fb-prompt-row__text {
          margin: 0;
          color: var(--txt-pure);
          line-height: 1.62;
          letter-spacing: -0.005em;
        }
        .fb-next-action__text {
          font-size: 14px;
        }
        .fb-next-action__foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .fb-next-action__hint {
          color: var(--txt-muted);
          font-size: 12px;
          line-height: 1.5;
        }
        .fb-prompt-panel {
          min-width: 0;
          border-radius: var(--r-sm);
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--btn-secondary-border);
          overflow: hidden;
          animation: fbSurfaceIn 0.58s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease;
        }
        .fb-prompt-panel:hover {
          transform: scale(1.015) translateZ(0);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.4), 0 0 32px 4px rgba(var(--signature-rgb), 0.18);
        }
        .fb-prompt-panel__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 16px;
          border-bottom: 1px solid rgba(var(--signature-rgb), 0.1);
        }
        .fb-prompt-panel__title {
          color: var(--txt-muted);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .fb-prompt-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .fb-prompt-row {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: baseline;
          padding: 13px 16px;
          border-top: 1px solid rgba(var(--signature-rgb), 0.08);
          animation: fbQueueIn 0.44s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition:
            background 0.18s ease,
            transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }
        .fb-prompt-row:first-child { border-top: none; }
        .fb-prompt-row:nth-child(2) { animation-delay: 0.07s; }
        .fb-prompt-row:nth-child(3) { animation-delay: 0.12s; }
        .fb-prompt-row:hover {
          background: rgba(var(--signature-rgb), 0.045);
          border-color: rgba(var(--signature-rgb), 0.16);
          transform: translateX(4px);
          box-shadow: inset 3px 0 0 rgba(var(--signature-rgb), 0.35);
        }
        .fb-prompt-row:hover .copy-btn {
          opacity: 1;
          border-color: rgba(var(--signature-rgb), 0.26);
          background: rgba(var(--signature-rgb), 0.08);
        }
        .fb-prompt-row__index {
          color: var(--txt-faint);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .fb-prompt-row__text {
          font-size: 12.8px;
        }
        .fb-copy-btn--compact {
          padding: 4px 7px;
        }
        .fb-empty-copy {
          margin: 0;
          color: var(--txt-muted);
          font-size: 13px;
          line-height: 1.6;
        }
        .fb-triage-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .fb-triage-lane {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
          padding: 16px 18px 18px;
          border-top: 2px solid;
          border-radius: var(--r-sm);
          background: var(--btn-secondary-bg);
          border-left: 1px solid var(--btn-secondary-border);
          border-right: 1px solid var(--btn-secondary-border);
          border-bottom: 1px solid var(--btn-secondary-border);
          overflow: hidden;
          animation: fbSurfaceIn 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition:
            transform 0.18s cubic-bezier(0.16, 1, 0.3, 1),
            border-color 0.18s ease,
            background 0.18s ease,
            box-shadow 0.18s ease;
        }
        .fb-triage-lane::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          height: 2px;
          background: var(--fb-lane-color);
          opacity: 0.85;
          box-shadow: 0 0 0 rgba(255,255,255,0);
          transition: opacity 0.18s ease, box-shadow 0.18s ease;
          pointer-events: none;
        }
        .fb-triage-lane:nth-child(2) { animation-delay: 0.06s; }
        .fb-triage-lane:nth-child(3) { animation-delay: 0.12s; }
        .fb-triage-lane:hover {
          transform: scale(1.015) translateZ(0);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--fb-lane-color) 46%, transparent), 0 0 32px 4px color-mix(in srgb, var(--fb-lane-color) 22%, transparent);
        }
        .fb-triage-lane:hover::before {
          opacity: 1;
          box-shadow: 0 0 16px 2px var(--fb-lane-color), 0 0 30px 6px color-mix(in srgb, var(--fb-lane-color) 32%, transparent);
        }
        .fb-triage-lane:hover .fb-triage-lane__count {
          text-shadow: 0 0 12px var(--fb-lane-color);
        }
        .fb-triage-lane__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .fb-triage-lane__title {
          margin: 0;
          color: var(--txt-pure);
          font-size: 14px;
          font-weight: 650;
          letter-spacing: -0.01em;
        }
        .fb-triage-lane__count,
        .fb-triage-item__index {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-variant-numeric: tabular-nums;
        }
        .fb-triage-lane__count {
          font-size: 12px;
          font-weight: 700;
          transition: text-shadow 0.18s ease;
        }
        .fb-triage-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .fb-triage-item {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          gap: 8px;
          color: var(--txt-pure);
          font-size: 13.5px;
          line-height: 1.55;
        }
        .fb-triage-item__index {
          color: var(--txt-faint);
          font-size: 11px;
          padding-top: 2px;
        }
        .fb-voice-body {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 20px 24px 24px;
        }
        .fb-summary-text {
          margin: 0;
          color: var(--txt-pure);
          font-size: 15px;
          line-height: 1.7;
          letter-spacing: -0.005em;
        }
        .fb-voice-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(230px, 310px);
          gap: 20px;
          align-items: start;
        }
        .fb-sentiment-block {
          display: flex;
          flex-direction: column;
          gap: 11px;
          min-width: 0;
          border-radius: var(--r-sm);
        }
        .fb-sentiment-title {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .fb-sentiment-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .fb-sentiment-label {
          color: var(--txt-pure);
          text-transform: capitalize;
          font-size: 18px;
          font-weight: 650;
          letter-spacing: -0.02em;
        }
        .fb-bar {
          display: flex;
          width: 100%;
          height: 8px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(var(--signature-rgb), 0.08);
        }
        .fb-bar > span {
          min-width: 2px;
          transform-origin: left center;
          animation: fbBarGrow 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .fb-sentiment-legend {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          color: var(--txt-muted);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        .fb-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .fb-stat {
          min-width: 0;
          padding: 12px 14px;
          border-radius: var(--r-sm);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, background 0.2s ease;
        }
        .fb-stat:hover {
          transform: scale(1.015) translateZ(0);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.4), 0 0 32px 4px rgba(var(--signature-rgb), 0.18);
        }
        .fb-stat__label {
          display: block;
          margin-bottom: 6px;
          color: var(--txt-faint);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fb-stat__value {
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 22px;
          font-weight: 600;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .fb-theme-list {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .fb-theme {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          padding: 4px 10px;
          border-radius: 999px;
          color: var(--txt-pure);
          background: rgba(var(--signature-rgb), 0.07);
          border: 1px solid rgba(var(--signature-rgb), 0.16);
          font-size: 12.5px;
          line-height: 1.3;
          transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
        }
        .fb-theme:hover {
          border-color: rgba(var(--signature-rgb), 0.36);
          background: rgba(var(--signature-rgb), 0.12);
          transform: translateY(-1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .fb-action-card,
          .fb-voice-card,
          .fb-prompt-panel,
          .fb-prompt-row,
          .fb-triage-lane,
          .fb-bar > span {
            animation: none !important;
          }
          .fb-next-action,
          .fb-prompt-panel,
          .fb-prompt-row,
          .fb-triage-lane,
          .fb-stat,
          .fb-theme {
            transition: none !important;
            transform: none !important;
          }
          .fb-workspace .fb-action-card:hover,
          .fb-workspace .fb-voice-card:hover,
          .fb-next-action:hover,
          .fb-prompt-panel:hover,
          .fb-prompt-row:hover,
          .fb-triage-lane:hover,
          .fb-stat:hover,
          .fb-theme:hover {
            transform: none !important;
          }
        }
        @media (max-width: 900px) {
          .fb-action-body,
          .fb-triage-grid,
          .fb-voice-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (max-width: 640px) {
          .fb-section-head,
          .fb-action-body,
          .fb-voice-body {
            padding-left: 18px;
            padding-right: 18px;
          }
          .fb-section-head,
          .fb-next-action,
          .fb-prompt-row {
            grid-template-columns: minmax(0, 1fr);
          }
          .fb-section-head {
            flex-direction: column;
          }
          .fb-action-count {
            align-self: flex-start;
          }
          .fb-prompt-row {
            align-items: start;
            gap: 8px;
          }
          .fb-prompt-row__index {
            order: -1;
          }
          .fb-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>

      <section className="glass-card fb-voice-card">
        <div className="fb-section-head">
          <div>
            <span className="recgon-label fb-section-kicker">voice of customer</span>
            <h2 className="fb-section-title">Why this is the current read</h2>
          </div>
          <div className="fb-section-meta">
            {analyzedAtLabel && <span>{analyzedAtLabel}</span>}
          </div>
        </div>

        <div className="fb-voice-body">
          {summary ? (
            <p className="fb-summary-text">{summary}</p>
          ) : (
            <p className="fb-empty-copy">No written summary was saved for this run.</p>
          )}

          <div className="fb-voice-grid">
            <div className="fb-sentiment-block">
              <div className="fb-sentiment-title">
                <span
                  className="fb-sentiment-dot"
                  style={{ background: sentColor, boxShadow: `0 0 10px ${sentColor}` }}
                />
                <span className="fb-sentiment-label">{sentiment}</span>
              </div>

              <div className="fb-bar">
                {breakdown.positive > 0 && (
                  <span style={{ flex: breakdown.positive, background: 'var(--success)' }} />
                )}
                {breakdown.neutral > 0 && (
                  <span
                    style={{
                      flex: breakdown.neutral,
                      background: 'rgba(var(--signature-rgb), 0.45)',
                    }}
                  />
                )}
                {breakdown.negative > 0 && (
                  <span style={{ flex: breakdown.negative, background: 'var(--fb-negative)' }} />
                )}
              </div>

              <SentimentLegend
                positive={breakdown.positive}
                neutral={breakdown.neutral}
                negative={breakdown.negative}
              />

              {themes.length > 0 && (
                <div className="fb-theme-list" aria-label="Feedback themes">
                  {themes.map((theme) => (
                    <span key={theme} className="fb-theme">
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="fb-stats">
              {stats.map((stat) => (
                <div key={stat.label} className="fb-stat">
                  <span className="fb-stat__label">{stat.label}</span>
                  <span className="fb-stat__value">{pad2(stat.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card fb-action-card">
        <div className="fb-section-head">
          <div>
            <span className="recgon-label fb-section-kicker">action queue</span>
            <h2 className="fb-section-title">What to ship next</h2>
          </div>
          <span className="fb-action-count">{pad2(developerPrompts.length)}</span>
        </div>

        <div className="fb-action-body">
          {topPrompt ? (
            <>
              <div className="fb-next-action">
                <div className="fb-next-action__top">
                  <span className="fb-next-action__label">next recommended action</span>
                  <p className="fb-next-action__text">{topPrompt}</p>
                </div>
                <div className="fb-next-action__foot">
                  <span className="fb-next-action__hint">Ready to paste into a coding agent.</span>
                  <CopyButton text={topPrompt} />
                </div>
              </div>

              <div className="fb-prompt-panel">
                <div className="fb-prompt-panel__head">
                  <span className="fb-prompt-panel__title">prompt queue</span>
                  <span className="fb-action-count">{pad2(Math.max(developerPrompts.length - 1, 0))}</span>
                </div>
                {remainingPrompts.length > 0 ? (
                  <div className="fb-prompt-list">
                    {remainingPrompts.map((prompt, index) => (
                      <div key={`${index}-${prompt}`} className="fb-prompt-row">
                        <span className="fb-prompt-row__index">
                          {pad2(index + 2)}
                        </span>
                        <p className="fb-prompt-row__text">{prompt}</p>
                        <CopyButton text={prompt} compact />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="fb-empty-copy" style={{ padding: '14px 16px' }}>
                    No supporting prompts in this run.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="fb-empty-copy">
              No developer prompts were generated for this run. Add more specific feedback
              or refresh the connected sources.
            </p>
          )}
        </div>
      </section>

      <div className="fb-triage-grid">
        {triageLanes.map((lane) => {
          const tone = LANE_TONE[lane.id];
          return (
            <TriageLane
              key={lane.id}
              title={lane.title}
              items={lane.items}
              color={tone.color}
              emptyText={tone.emptyText}
            />
          );
        })}
      </div>
    </div>
  );
}
