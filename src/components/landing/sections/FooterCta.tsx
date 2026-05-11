'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import RecgonLogo from '@/components/RecgonLogo';
import BlurText from '../BlurText';

const Aurora = dynamic(() => import('../Aurora'), { ssr: false });

// Aurora colorStops are tuned per theme.
// Dark: deep wine → signature pink → deep wine (over-compositing on black bg).
// Light: pure white → signature pink → pure white. The light-mode canvas
// uses `mix-blend-mode: multiply`, so white edges multiply with the white
// page bg (= no change, edges vanish) and the pink center darkens white
// into a saturated pink wash. This avoids the muddy gray smears that the
// shader produces under normal over-compositing on a light bg.
const AURORA_DARK: [string, string, string] = ['#1a0a10', '#f0b8d0', '#1a0a10'];
const AURORA_LIGHT: [string, string, string] = ['#ffffff', '#c2357a', '#ffffff'];

export default function FooterCta() {
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
            blend={isLight ? 0.55 : 0.4}
            speed={isLight ? 0.4 : 0.5}
          />
        </div>
        <div className="lnd-cta-v1-inner">
          <h2 className="lnd-cta-v1-title">
            <BlurText
              text="Ready to stop guessing?"
              animateBy="words"
              delay={100}
              stepDuration={0.4}
              style={{ justifyContent: 'center' }}
            />
          </h2>
          <p className="lnd-cta-v1-sub">
            Join the small teams who use Recgon to understand their product, focus their work, and ship faster.
          </p>
          <div className="lnd-cta-v1-row">
            <Link href="/register" className="lnd-cta-v1-primary">Get started</Link>
            <Link href="/login" className="lnd-cta-v1-ghost">Sign in</Link>
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
            <Link href="/login" className="lnd-foot-link">Sign in</Link>
            <Link href="/register" className="lnd-foot-link">Register</Link>
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
          z-index: 0;
          pointer-events: none;
        }
        /* Light mode: switch the canvas to multiply blend so the shader's
           pink ramp tints the white page bg (instead of overlaying dark
           muddy pink onto it). With white-edge stops, the ribbon ends
           become invisible (white × white = white) and only the pink
           center darkens the bg into a clean pink wash. */
        .lnd-cta-v1.is-light .lnd-cta-aurora canvas {
          mix-blend-mode: multiply;
        }
        .lnd-cta-v1.is-light .lnd-cta-aurora { opacity: 0.9; }
        /* Dark mode: vignette toward near-black so the title pops. */
        .lnd-cta-v1::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 1;
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
          z-index: 2;
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
        .lnd-cta-v1-sub {
          margin: 0 auto 40px;
          font-size: 1.05rem;
          line-height: 1.6;
          color: var(--txt-muted);
          max-width: 480px;
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
