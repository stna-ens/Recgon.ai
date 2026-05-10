'use client';

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
  const { title, steps } = parseAnalyticsError(error);
  return (
    <div className="v2-an">
      <header className="v2-an-head">
        <div>
          <span className="recgon-label v2-eyebrow">› analytics</span>
          <h2 className="v2-an-title">
            <span className="v2-pink">analytics</span> unavailable.
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
          new to GA4? help →
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
            retry
          </button>
          {propertyConfig?.hasCredentials && isOwner && (
            <button type="button" className="v2-btn v2-btn-ghost" onClick={onDisconnect}>
              disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
