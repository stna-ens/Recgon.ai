'use client';

// Phase 2 / Plan 02-03 / SKILL-01.
//
// Inline .glass-card on the form column. Two states:
//   - Pre-consent  (consentedAt === null): body + primary CTA `Connect GitHub
//     for skill mining` (signature-pink fill).
//   - Post-consent (consentedAt !== null): identity line + small "Stop mining"
//     secondary text-button. Stop-mining opens a Radix AlertDialog confirm
//     with the locked copy from UI-SPEC §Consent inline section.
//
// All copy strings inlined verbatim from UI-SPEC; no metaphor language.
// First-person voice ("I'll re-check weekly").

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

// lucide-react dropped the `Github` brand glyph; inline a small mark instead.
// 14px (matches Re-scan + other small leading-glyph CTAs in this file).
function GithubMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.18c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.27-5.23-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.17a10.93 10.93 0 0 1 5.74 0c2.18-1.48 3.14-1.17 3.14-1.17.63 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.07 0 4.4-2.68 5.36-5.24 5.65.41.35.77 1.05.77 2.11v3.13c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

interface Props {
  githubUsername?: string | null;
  consentedAt: string | null;
  onConnect: () => void;
  onStopMining: () => Promise<void> | void;
}

export default function GithubConsentSection({
  githubUsername,
  consentedAt,
  onConnect,
  onStopMining,
}: Props) {
  const t = useTranslations('teams.profile.consent');
  const [stopOpen, setStopOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isConnected = consentedAt !== null;

  return (
    <section className="glass-card github-consent">
      <span className="github-consent__eyebrow">{t('eyebrow')}</span>
      <h2 className="github-consent__heading">{t('heading')}</h2>

      <p className="github-consent__body">
        {t('body1')}
      </p>

      <p className="github-consent__body github-consent__body--muted">
        {t('body2')}
      </p>

      <div className="github-consent__chips" aria-label={t('chipsAria')}>
        <span className="github-consent__chip">{t('chipPersonalRepos')}</span>
        <span className="github-consent__chip">{t('chipPrBodies')}</span>
        <span className="github-consent__chip">{t('chipOutsideCommits')}</span>
      </div>

      {!isConnected ? (
        <button
          type="button"
          className="github-consent__cta"
          onClick={onConnect}
          aria-label={t('connectCta')}
        >
          <GithubMark size={14} />
          <span>{t('connectCta')}</span>
        </button>
      ) : (
        <div className="github-consent__connected">
          <span className="github-consent__connected-line">
            {t('connectedLine', { who: githubUsername ?? t('connectedFallback') })}
          </span>
          <AlertDialog.Root open={stopOpen} onOpenChange={setStopOpen}>
            <AlertDialog.Trigger asChild>
              <button
                type="button"
                className="github-consent__stop"
                aria-label={t('stopMining')}
              >
                {t('stopMining')}
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="github-consent__overlay" />
              <AlertDialog.Content className="github-consent__dialog">
                <AlertDialog.Title className="github-consent__dialog-title">
                  {t('dialogTitle')}
                </AlertDialog.Title>
                <AlertDialog.Description className="github-consent__dialog-body">
                  {t('dialogBody')}
                </AlertDialog.Description>
                <div className="github-consent__dialog-actions">
                  <AlertDialog.Cancel asChild>
                    <button type="button" className="github-consent__dialog-cancel">
                      {t('keepMining')}
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      type="button"
                      className="github-consent__dialog-confirm"
                      disabled={submitting}
                      onClick={async (e) => {
                        e.preventDefault();
                        setSubmitting(true);
                        try {
                          await onStopMining();
                          setStopOpen(false);
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                    >
                      {submitting ? t('stopping') : t('stopMining')}
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      )}

      <style>{`
        .github-consent {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 32px;
          margin-top: 24px;
        }
        .github-consent__eyebrow {
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: var(--txt-muted);
          text-transform: uppercase;
        }
        .github-consent__heading {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--txt-pure);
          margin: 0;
        }
        .github-consent__body {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 16px;
          line-height: 1.5;
          color: var(--txt-pure);
          margin: 0;
        }
        .github-consent__body--muted {
          color: var(--txt-muted);
        }
        .github-consent__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }
        .github-consent__chip {
          padding: 6px 10px;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 400;
          color: var(--txt-muted);
          background: var(--btn-secondary-bg);
          border-radius: var(--r-sm);
        }
        .github-consent__cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
          padding: 12px 20px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: white;
          background: var(--signature);
          border: none;
          border-radius: var(--r-sm);
          cursor: pointer;
          align-self: flex-start;
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .github-consent__cta:hover { opacity: 0.92; }
        .github-consent__cta:active { transform: translateY(1px); }

        .github-consent__connected {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 4px;
        }
        .github-consent__connected-line {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 16px;
          line-height: 1.5;
          color: var(--txt-pure);
        }
        .github-consent__stop {
          align-self: flex-start;
          padding: 0;
          font-family: var(--font-mono), 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 400;
          color: var(--txt-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease-out);
        }
        .github-consent__stop:hover {
          color: var(--txt-pure);
          text-decoration: underline;
        }

        .github-consent__overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(4px);
          /* Above the top nav (z-index 200) like every other modal — otherwise
             the nav stays bright and clickable through the dimmed overlay. */
          z-index: 1000;
        }
        .github-consent__dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(440px, calc(100vw - 32px));
          padding: 24px;
          background: var(--glass-substrate);
          border: 1px solid var(--btn-secondary-border);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-float);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .github-consent__dialog-title {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--txt-pure);
          margin: 0;
        }
        .github-consent__dialog-body {
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 16px;
          line-height: 1.5;
          color: var(--txt-muted);
          margin: 0;
        }
        .github-consent__dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }
        .github-consent__dialog-cancel,
        .github-consent__dialog-confirm {
          padding: 10px 18px;
          font-family: var(--font-inter), Inter, sans-serif;
          font-size: 14px;
          font-weight: 600;
          border-radius: var(--r-sm);
          cursor: pointer;
          transition: opacity 120ms ease;
        }
        .github-consent__dialog-cancel {
          color: var(--txt-pure);
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
        }
        .github-consent__dialog-cancel:hover { opacity: 0.85; }
        .github-consent__dialog-confirm {
          color: white;
          background: var(--danger);
          border: none;
        }
        .github-consent__dialog-confirm:hover { opacity: 0.92; }
        .github-consent__dialog-confirm:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  );
}
