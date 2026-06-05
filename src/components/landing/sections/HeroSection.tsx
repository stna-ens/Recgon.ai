'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import DecryptedText from '../DecryptedText';
import LandingDotField from '../LandingDotField';

const AUDIENCE_KEYS = [
  'smallTeams',
  'earlyStartups',
  'indieHackers',
  'foundingTeams',
  'sideProjects',
  'soloFounders',
  'productTeams',
] as const;

export default function HeroSection() {
  const t = useTranslations('landing.hero');
  const AUDIENCE = useMemo(
    () => AUDIENCE_KEYS.map((k) => t(`audience.${k}`)),
    [t],
  );
  const [done, setDone] = useState(false);
  const [audReady, setAudReady] = useState(false);
  const [audIdx, setAudIdx] = useState(0);
  const [audKey, setAudKey] = useState(0);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setAudReady(true), 240);
    return () => clearTimeout(id);
  }, [done]);

  useEffect(() => {
    if (!audReady) return;
    const id = setInterval(() => {
      setAudIdx((i) => (i + 1) % AUDIENCE_KEYS.length);
      setAudKey((k) => k + 1);
    }, 2600);
    return () => clearInterval(id);
  }, [audReady]);

  const aud = AUDIENCE[audIdx];

  return (
    <section className="lnd-hero">
      <div className="lnd-hero-bg" aria-hidden="true">
        <LandingDotField mode="parent" spacing={22} reach={140} />
      </div>
      <div className="lnd-hero-aura" aria-hidden="true" />

      <div className="lnd-hero-inner">
        <span
          className="recgon-label lnd-hero-label"
          aria-label={t('audienceAria')}
        >
          {t('forPrefix')} {audReady ? (
            <DecryptedText
              key={`aud-${audKey}`}
              text={aud}
              animateOn="view"
              sequential
              speed={28}
              maxIterations={10}
              className="lnd-aud-decoded"
              encryptedClassName="lnd-aud-encoded"
            />
          ) : AUDIENCE[0]}
        </span>

        <h1 className="lnd-hero-title">
          {!done ? (
            <DecryptedText
              text={t('titleStatic')}
              animateOn="view"
              sequential
              speed={36}
              maxIterations={12}
              className="lnd-decoded"
              encryptedClassName="lnd-encoded"
              onComplete={() => setDone(true)}
            />
          ) : (
            <>
              {t('titlePrefix')}{' '}
              <span className="lnd-hero-accent lnd-hero-aud" aria-live="polite">
                <DecryptedText
                  key={`h1-${audKey}`}
                  text={`${aud}.`}
                  animateOn="view"
                  sequential
                  speed={32}
                  maxIterations={10}
                  className="lnd-h1-aud-decoded"
                  encryptedClassName="lnd-h1-aud-encoded"
                />
              </span>
            </>
          )}
        </h1>

        <p className="lnd-hero-sub">
          {t('subtitle')}
        </p>

        <div className="lnd-hero-cta">
          <Link href="/register" className="lnd-btn-primary">
            {t('getStarted')}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <a href="#how-it-works" className="lnd-hero-pill" aria-label={t('seeHowAria')}>
          <span className="lnd-hero-pill-tag">{t('stepsTag')}</span>
          <span className="lnd-hero-pill-text">{t('seeHow')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="lnd-hero-pill-arrow">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </a>
      </div>

      <style>{`
        .lnd-hero {
          position: relative;
          min-height: 100vh;
          min-height: 100svh;
          padding: 112px 24px 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          isolation: isolate;
        }
        .lnd-hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }
        .lnd-hero-bg > canvas {
          width: 100%;
          height: 100%;
        }
        .lnd-hero-aura {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(820px, 92%);
          height: min(560px, 80%);
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(ellipse 65% 60% at 50% 50%, rgba(var(--signature-rgb), 0.18), transparent 70%);
          opacity: 0.9;
          filter: blur(20px);
        }
        .light .lnd-hero-aura { opacity: 0.55; }
        .lnd-hero-inner {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 760px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .lnd-hero-label {
          margin-bottom: 22px;
          opacity: 1;
        }
        .lnd-aud-encoded { color: rgba(var(--signature-rgb), 0.45); }
        .lnd-aud-decoded { color: var(--signature); }
        .lnd-hero-title {
          margin: 0 0 22px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(2rem, 5vw, 3.4rem);
          line-height: 1.08;
          letter-spacing: -0.035em;
          font-weight: 600;
          color: var(--txt-pure);
          max-width: 860px;
        }
        .lnd-hero-accent { color: var(--signature); }
        .lnd-h1-aud-encoded { color: rgba(var(--signature-rgb), 0.4); }
        .lnd-h1-aud-decoded { color: var(--signature); }
        .lnd-encoded { color: rgba(var(--signature-rgb), 0.45); }
        .lnd-decoded { color: var(--txt-pure); }

        .lnd-hero-sub {
          margin: 0 0 36px;
          font-size: 17px;
          line-height: 1.55;
          color: var(--txt-muted);
          max-width: 560px;
          font-weight: 400;
        }

        .lnd-hero-cta {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 40px;
        }
        .lnd-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 13px 22px;
          border-radius: 10px;
          background: var(--signature);
          color: white;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          letter-spacing: -0.005em;
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.5),
            0 10px 28px -10px rgba(var(--signature-rgb), 0.7);
          transition: transform .2s var(--ease-out), box-shadow .2s ease;
        }
        .lnd-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow:
            0 0 0 1px rgba(var(--signature-rgb), 0.6),
            0 18px 40px -12px rgba(var(--signature-rgb), 0.75);
        }
        .lnd-btn-primary svg { transition: transform .18s ease; }
        .lnd-btn-primary:hover svg { transform: translateX(3px); }
        .lnd-hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          border-radius: 999px;
          background: var(--bg-content);
          border: 1px solid rgba(var(--signature-rgb), 0.12);
          backdrop-filter: blur(30px) saturate(160%);
          -webkit-backdrop-filter: blur(30px) saturate(160%);
          text-decoration: none;
          transition: border-color .2s var(--ease-out), background .2s ease, transform .2s var(--ease-out);
        }
        .lnd-hero-pill:hover {
          border-color: rgba(var(--signature-rgb), 0.45);
          background: rgba(var(--signature-rgb), 0.06);
          transform: translateY(-1px);
        }
        .lnd-hero-pill-tag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: var(--signature);
          font-weight: 700;
          opacity: 0.85;
        }
        .lnd-hero-pill-text {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px;
          letter-spacing: 0.4px;
          color: var(--txt-pure);
          font-weight: 600;
        }
        .lnd-hero-pill-arrow {
          color: var(--signature);
          transition: transform .2s var(--ease-out);
        }
        .lnd-hero-pill:hover .lnd-hero-pill-arrow {
          transform: translateY(2px);
        }

        @media (max-width: 640px) {
          .lnd-hero { padding: 96px 18px 64px; }
          .lnd-hero-sub { font-size: 15px; }
          .lnd-btn-primary { width: 100%; justify-content: center; }
        }
      `}</style>
    </section>
  );
}
