'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import RecgonLogo from '@/components/RecgonLogo';
import BlurText from '../BlurText';

const Aurora = dynamic(() => import('../Aurora'), { ssr: false });

// Aurora colorStops are tuned per theme.
// Dark: deep wine → signature pink → deep wine. The shader dims color by
// intensity, so dim-pink-over-black reads as a ribbon.
// Light: pale blush → signature pink → pale blush. Aurora runs with
// `lightMode` so color is NOT dimmed — the ribbon shape comes from the
// alpha mask alone. Blush edges fade to transparent at the ribbon ends,
// and the pink core sits cleanly on the white bg.
const AURORA_DARK: [string, string, string] = ['#1a0a10', '#f0b8d0', '#1a0a10'];
const AURORA_LIGHT: [string, string, string] = ['#fde4ee', '#c2357a', '#fde4ee'];

export default function FooterCta() {
  const t = useTranslations('landing.footerCta');
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark';
  const isLight = active === 'light';
  const stops = isLight ? AURORA_LIGHT : AURORA_DARK;

  return (
    <>
      <section className={`lnd-cta-v1 ${isLight ? 'is-light' : ''}`}>
        <div className="lnd-cta-aurora" aria-hidden="true">
          <Aurora
            colorStops={stops}
            amplitude={isLight ? 0.85 : 1.0}
            blend={isLight ? 0.45 : 0.4}
            speed={isLight ? 0.4 : 0.5}
            lightMode={isLight}
          />
        </div>
        <div className="lnd-cta-v1-inner">
          <h2 className="lnd-cta-v1-title">
            <BlurText
              text={t('title')}
              animateBy="words"
              delay={100}
              stepDuration={0.4}
              style={{ justifyContent: 'center' }}
            />
          </h2>
          <p className="lnd-cta-v1-sub">
            {t('subtitle')}
          </p>
          <div className="lnd-cta-v1-row">
            <Link href="/register" className="lnd-cta-v1-primary">{t('getStarted')}</Link>
            <Link href="/login" className="lnd-cta-v1-ghost">{t('signIn')}</Link>
          </div>
        </div>
      </section>

      <footer className="lnd-foot">
        <div className="lnd-foot-inner">
          <Link href="/landing" className="lnd-foot-brand">
            <RecgonLogo size={20} uid="lnd-foot-logo" />
            <span>recgon</span>
          </Link>
          <nav className="lnd-foot-nav">
            <Link href="/login" className="lnd-foot-link">{t('signIn')}</Link>
            <Link href="/register" className="lnd-foot-link">{t('register')}</Link>
          </nav>
        </div>
      </footer>

      <style>{`
        .lnd-cta-v1 {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          background: var(--bg-deep);
        }
        .lnd-cta-aurora {
          position: absolute;
          inset: 0;
          /* z-index:-1 contained by the section's isolation: isolate.
             Sits behind in-flow content, so text inside .lnd-cta-v1-inner
             (which is NOT its own stacking context) can mix-blend with
             the aurora via the section's stacking context. */
          z-index: -1;
          pointer-events: none;
        }
        /* Light mode: Aurora runs with the lightMode flag so it outputs
           full rampColor (no intensity dimming). With blush-pink-blush
           stops on a white bg the ribbon reads as a clean pink wash.
           Small opacity damp keeps the ribbon ambient. */
        .lnd-cta-v1.is-light .lnd-cta-aurora { opacity: 0.85; }
        /* Dark mode: vignette toward near-black so the title pops.
           z-index:-1 keeps it below the in-flow text content but above
           the aurora canvas (later DOM position wins among same-z). */
        .lnd-cta-v1::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(5,5,5,0.35) 70%, rgba(5,5,5,0.65) 100%);
          pointer-events: none;
        }
        /* Light mode: with multiply blend + white-edge stops the canvas
           already self-feathers to bg. Just a soft top/bottom seam so the
           section transitions into the page without a hard edge. */
        .lnd-cta-v1.is-light::after {
          background: linear-gradient(
            to bottom,
            rgba(245,245,247,0.55) 0%,
            transparent 14%,
            transparent 86%,
            rgba(245,245,247,0.7) 100%
          );
        }
        .lnd-cta-v1-inner {
          position: relative;
          /* DO NOT add z-index here — z-index on positioned elements
             creates a new stacking context, which would isolate the
             title/subtitle from the aurora and break mix-blend-mode.
             The inner already sits above the aurora because aurora is
             explicitly z:-1 inside the section's isolated context. */
          text-align: center;
          padding: 140px 32px;
          max-width: 720px;
          margin: 0 auto;
        }
        .lnd-cta-v1-title {
          margin: 0 0 20px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.6rem, 4vw, 2.5rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.1;
          color: var(--txt-pure);
        }
        /* Light mode: luminosity-blend the title against the aurora.
           luminosity = take bg hue+saturation, apply source luminance.
           So:
             - over white (no chroma) → renders as grayscale at the
               source's luminance ≈ near-black, bold and readable
             - over pink aurora → borrows the pink hue at source's low
               luminance ≈ very dark wine — palette-cohesive, no green
           Dark source color is what drives the "dark text" feel; the
           background decides whether that dark reads as gray or wine. */
        .lnd-cta-v1.is-light .lnd-cta-v1-title {
          color: #1a1a1a;
          mix-blend-mode: luminosity;
        }
        .lnd-cta-v1-sub {
          margin: 0 auto 40px;
          font-size: 1.05rem;
          line-height: 1.6;
          color: var(--txt-muted);
          max-width: 480px;
        }
        /* Light mode: luminosity-blend the subtitle, same logic as the
           title but with a higher source luminance so it reads as a
           comfortable mid-gray on white and a mid-pink on the aurora —
           noticeable color shift, still in palette.
           Note: do NOT add opacity here. opacity < 1 creates a new
           stacking context which cuts mix-blend-mode off from the aurora
           behind and makes the blend silently fail. */
        .lnd-cta-v1.is-light .lnd-cta-v1-sub {
          color: #6a6a6a;
          mix-blend-mode: luminosity;
        }
        .lnd-cta-v1-row {
          display: inline-flex;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .lnd-cta-v1-primary {
          padding: 15px 32px;
          border-radius: 10px;
          background: var(--signature);
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          letter-spacing: -0.005em;
          transition: transform .2s var(--ease-out), box-shadow .2s ease;
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.5), 0 10px 30px -8px rgba(var(--signature-rgb), 0.55);
        }
        .lnd-cta-v1-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px rgba(var(--signature-rgb), 0.65), 0 20px 44px -10px rgba(var(--signature-rgb), 0.7);
        }
        /* Ghost button — token-driven so it inverts cleanly in light mode. */
        .lnd-cta-v1-ghost {
          padding: 15px 32px;
          border-radius: 10px;
          background: rgba(var(--signature-rgb), 0.03);
          border: 1px solid var(--rule, rgba(127,127,127,0.18));
          color: var(--txt-pure);
          font-size: 15px;
          font-weight: 500;
          letter-spacing: -0.005em;
          text-decoration: none;
          transition: border-color .2s ease, background .2s ease, transform .2s var(--ease-out);
        }
        .lnd-cta-v1.is-light .lnd-cta-v1-ghost {
          background: rgba(255,255,255,0.55);
          border-color: rgba(0,0,0,0.10);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
        }
        .lnd-cta-v1-ghost:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--signature-rgb), 0.45);
          background: rgba(var(--signature-rgb), 0.07);
        }
        .lnd-cta-v1.is-light .lnd-cta-v1-ghost:hover {
          background: rgba(255,255,255,0.75);
          border-color: rgba(var(--signature-rgb), 0.55);
        }

        .lnd-foot {
          padding: 28px 24px 36px;
          border-top: 1px solid rgba(var(--signature-rgb), 0.08);
          background: var(--bg-deep);
        }
        .lnd-foot-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .lnd-foot-brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--txt-pure);
          text-decoration: none;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .lnd-foot-line {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          letter-spacing: 0.4px;
        }
        .lnd-foot-nav { display: inline-flex; gap: 14px; }
        .lnd-foot-link {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          text-decoration: none;
          transition: color .2s ease;
        }
        .lnd-foot-link:hover { color: var(--txt-pure); }

        @media (max-width: 640px) {
          .lnd-cta-v1-inner { padding: 96px 22px; }
          .lnd-cta-v1-primary, .lnd-cta-v1-ghost { width: 100%; text-align: center; }
          .lnd-cta-v1-row { flex-direction: column; width: 100%; max-width: 320px; }
          .lnd-foot-inner { flex-direction: column; gap: 10px; text-align: center; }
        }
      `}</style>
    </>
  );
}
