'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface Props {
  /** Eyebrow / title (e.g. "feedback", "marketing"). */
  title: string;
  /** Sentence body explaining what the tab will do. */
  body: string;
  /** Where to find the same data today (existing global page). */
  fallbackHref: string;
  /** Label for the fallback link. */
  fallbackLabel: string;
  /** Numeral shown big (e.g. "02"). */
  numeral: string;
}

/**
 * Used by Phase-2 stub tabs (Feedback, Marketing, Analytics, Settings).
 * Honest "in progress" panel that points users at the global page where
 * the data already lives, so nothing is hidden — just the v2-scoped view
 * isn't ported yet.
 */
export default function TabPlaceholder({ title, body, fallbackHref, fallbackLabel, numeral }: Props) {
  const t = useTranslations('home');
  return (
    <div className="v2-stub">
      <header className="v2-stub-head">
        <span className="recgon-label v2-stub-eye">{t('stub.eyebrow', { title })}</span>
        <h2 className="v2-stub-title">
          <span className="v2-pink">{t('stub.soon')}</span>{t('stub.soonRest')}
        </h2>
      </header>

      <div className="glass-card is-static is-roomy v2-stub-card">
        <div className="v2-stub-num" aria-hidden="true">{numeral}</div>
        <div className="v2-stub-body">
          <p className="v2-stub-text">{body}</p>
          <Link href={fallbackHref} className="v2-stub-link">
            {fallbackLabel}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>

      <style>{`
        .v2-stub {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-bottom: 32px;
          animation: v2pageFade 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes v2pageFade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .v2-stub-eye { color: var(--signature); margin: 0 0 8px; }
        .v2-stub-title {
          font-size: clamp(22px, 2.5vw, 28px);
          font-weight: 600;
          letter-spacing: -0.018em;
          color: var(--txt-pure);
          margin: 0;
          line-height: 1.2;
        }
        .v2-pink { color: var(--signature); }
        .v2-stub-card {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 32px;
          align-items: center;
        }
        .v2-stub-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 84px;
          font-weight: 200;
          line-height: 1;
          color: var(--signature);
          letter-spacing: -0.05em;
          opacity: 0.92;
          font-variant-numeric: tabular-nums;
        }
        .v2-stub-text {
          font-size: 14.5px;
          line-height: 1.65;
          color: var(--txt-muted);
          margin: 0 0 18px;
          max-width: 520px;
        }
        .v2-stub-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--txt-pure);
          border-radius: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          text-decoration: none;
          transition: border-color 200ms ease, color 200ms ease, background 200ms ease;
        }
        .v2-stub-link:hover {
          border-color: rgba(var(--signature-rgb), 0.40);
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.04);
        }
        .v2-stub-link svg { transition: transform 200ms ease; }
        .v2-stub-link:hover svg { transform: translateX(3px); }

        @media (max-width: 640px) {
          .v2-stub-card { grid-template-columns: 1fr; gap: 16px; }
          .v2-stub-num { font-size: 56px; }
        }
      `}</style>
    </div>
  );
}
