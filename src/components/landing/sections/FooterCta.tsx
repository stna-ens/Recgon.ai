'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import RecgonLogo from '@/components/RecgonLogo';
import BlurText from '../BlurText';

const Aurora = dynamic(() => import('../Aurora'), { ssr: false });

// Aurora colorStops are tuned per theme. Dark: deep wine → signature pink →
// deep wine (matches v1). Light: pale wabi-gray → saturated signature pink →
// pale wabi-gray (Apple-light feel).
const AURORA_DARK: [string, string, string] = ['#1a0a10', '#f0b8d0', '#1a0a10'];
const AURORA_LIGHT: [string, string, string] = ['#f5f5f7', '#c2357a', '#f5f5f7'];

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
        {isLight ? (
          <div className="lnd-cta-glow-light" aria-hidden="true" />
        ) : (
          <div className="lnd-cta-aurora" aria-hidden="true">
            <Aurora
              colorStops={stops}
              amplitude={1.0}
              blend={0.4}
              speed={0.5}
            />
          </div>
        )}
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
        /* Light-mode replacement for Aurora — a soft, static pink wash on
           Apple-wabi gray. Subtle is intentional: this section should feel
           like the rest of the light page, not a dramatic dark hero. */
        .lnd-cta-glow-light {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 55% 70% at 50% 50%, rgba(var(--signature-rgb), 0.22) 0%, transparent 65%),
            radial-gradient(ellipse 90% 60% at 50% 100%, rgba(var(--signature-rgb), 0.10) 0%, transparent 70%);
        }
        /* Dark mode: vignette toward near-black so the title pops. */
        .lnd-cta-v1::after {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 1;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(5,5,5,0.35) 70%, rgba(5,5,5,0.65) 100%);
          pointer-events: none;
        }
        /* Light mode: paler vignette toward the Apple-wabi background so the
           Aurora's pink doesn't blow out and the page bg blends in at the edges. */
        .lnd-cta-v1.is-light::after {
          background: radial-gradient(ellipse at center, transparent 0%, rgba(245,245,247,0.45) 70%, rgba(245,245,247,0.85) 100%);
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
