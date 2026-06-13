'use client';

import { useTranslations } from 'next-intl';

const STEPS = [
  { num: '01', key: 'step1' },
  { num: '02', key: 'step2' },
  { num: '03', key: 'step3' },
] as const;

export default function HowItWorksSection() {
  const t = useTranslations('landing.how');
  return (
    <section id="how-it-works" className="lnd-how">
      <div className="lnd-how-head">
        <span className="recgon-label">{t('label')}</span>
        <h2 className="lnd-how-title">{t('title')}</h2>
      </div>

      <ol className="lnd-how-list">
        {STEPS.map(({ num, key }) => (
          <li key={num} className="glass-card lnd-how-step">
            <span className="lnd-how-num">{num}</span>
            <div className="lnd-how-text">
              <h3 className="lnd-how-step-title">{t(`${key}.title`)}</h3>
              <p className="lnd-how-step-body">{t(`${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <style>{`
        .lnd-how {
          padding: 64px 24px 88px;
          max-width: 880px;
          margin: 0 auto;
        }
        .lnd-how-head {
          max-width: 640px;
          margin: 0 auto 40px;
          text-align: center;
        }
        .lnd-how-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.2;
        }
        .lnd-how-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .lnd-how-step {
          padding: 22px 26px !important;
          display: flex;
          align-items: flex-start;
          gap: 22px;
        }
        .lnd-how-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 28px;
          font-weight: 700;
          color: var(--signature);
          letter-spacing: -0.02em;
          line-height: 1;
          opacity: 0.7;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .lnd-how-text { min-width: 0; }
        .lnd-how-step-title {
          margin: 0 0 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 15px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.015em;
        }
        .lnd-how-step-body {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: var(--txt-muted);
        }
        @media (max-width: 640px) {
          .lnd-how { padding: 56px 18px; }
          .lnd-how-step { padding: 18px !important; gap: 16px; }
          .lnd-how-num { font-size: 22px; }
        }
      `}</style>
    </section>
  );
}
