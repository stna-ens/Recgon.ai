'use client';

import { Eye, Brain, UserCheck, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

const TILES = [
  { icon: Eye, key: 'read' },
  { icon: Brain, key: 'decide' },
  { icon: UserCheck, key: 'assign' },
  { icon: ShieldCheck, key: 'verify' },
] as const;

export default function CapabilitiesSection() {
  const t = useTranslations('landing.capabilities');
  return (
    <section id="capabilities" className="lnd-caps">
      <div className="lnd-caps-head">
        <span className="recgon-label">{t('label')}</span>
        <h2 className="lnd-caps-title">{t('title')}</h2>
      </div>

      <div className="lnd-caps-grid">
        {TILES.map(({ icon: Icon, key }) => (
          <article key={key} className="glass-card lnd-caps-tile">
            <span className="lnd-caps-icon"><Icon size={20} strokeWidth={2} /></span>
            <span className="recgon-label lnd-caps-label">{t(`${key}.label`)}</span>
            <h3 className="lnd-caps-tile-title">{t(`${key}.title`)}</h3>
            <p className="lnd-caps-body">{t(`${key}.body`)}</p>
          </article>
        ))}
      </div>

      <style>{`
        .lnd-caps {
          padding: 88px 24px 64px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .lnd-caps-head {
          max-width: 640px;
          margin: 0 auto 48px;
          text-align: center;
        }
        .lnd-caps-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.4rem, 2.8vw, 1.9rem);
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--txt-pure);
          line-height: 1.18;
        }

        .lnd-caps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 18px;
        }
        .lnd-caps-tile {
          padding: 22px !important;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 200px;
        }
        .lnd-caps-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(var(--signature-rgb), 0.1);
          color: var(--signature);
        }
        .lnd-caps-label {
          margin: 0;
          font-size: 10px;
          opacity: 0.9;
        }
        .lnd-caps-tile-title {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.015em;
          line-height: 1.3;
        }
        .lnd-caps-body {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: var(--txt-muted);
        }

        @media (max-width: 640px) {
          .lnd-caps { padding: 56px 18px; }
        }
      `}</style>
    </section>
  );
}
