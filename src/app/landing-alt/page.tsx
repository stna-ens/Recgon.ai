'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import DecryptedText from '@/components/landing/DecryptedText';
import FaultyTerminal from '@/components/landing/FaultyTerminal';

const FEATURES = [
  { name: 'Code DNA', detail: 'Analyzes architecture, stack, SWOT, and blind spots from your real codebase.' },
  { name: 'Signal Marketing', detail: 'Generates launch-ready content for Instagram, TikTok, and Google Ads.' },
  { name: 'Campaign Engine', detail: 'Builds executable campaign plans with timing, hooks, and creative directions.' },
  { name: 'Feedback Radar', detail: 'Clusters sentiment and turns raw comments into concrete product actions.' },
  { name: 'GA4 Narratives', detail: 'Converts analytics metrics into insights you can actually execute on.' },
  { name: 'Mentor Terminal', detail: 'Chat with an AI that already understands your product and priorities.' },
];

const METRICS = [
  { value: '7+', label: 'Integrated workflows' },
  { value: '<60s', label: 'To first analysis' },
  { value: '24/7', label: 'Execution guidance' },
];

function TerminalCursor() {
  return <span className="rg-cursor" />;
}

export default function LandingAltPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .rg-page {
          --rg-bg: #030304;
          --rg-panel: rgba(12, 12, 15, 0.78);
          --rg-panel-strong: rgba(12, 12, 15, 0.92);
          --rg-line: rgba(255, 255, 255, 0.1);
          --rg-line-hot: rgba(240, 184, 208, 0.36);
          --rg-accent: #f0b8d0;
          --rg-text: #f7f7fb;
          --rg-muted: #9e9ea7;
          --rg-good: #30d158;
          background: var(--rg-bg);
          color: var(--rg-text);
          min-height: 100vh;
          font-family: 'Sora', sans-serif;
          position: relative;
          overflow: clip;
        }

        .rg-page::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(64vw 42vw at 90% 6%, rgba(240, 184, 208, 0.2), transparent 72%),
            radial-gradient(52vw 38vw at 0% 100%, rgba(153, 105, 255, 0.14), transparent 70%);
          z-index: 0;
        }

        .rg-grid-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at center, black 45%, transparent 92%);
          z-index: 0;
        }

        .rg-shell {
          position: relative;
          z-index: 2;
          width: min(1180px, calc(100% - 40px));
          margin: 0 auto;
          padding: 20px 0 72px;
        }

        .rg-nav {
          position: sticky;
          top: 14px;
          z-index: 10;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          border: 1px solid var(--rg-line);
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.58);
          backdrop-filter: blur(20px);
          padding: 10px 12px 10px 16px;
        }

        .rg-brand {
          font-family: 'Chakra Petch', sans-serif;
          font-weight: 700;
          letter-spacing: 0.03em;
          font-size: 15px;
        }

        .rg-brand b {
          color: var(--rg-accent);
          font-weight: 700;
        }

        .rg-nav-actions {
          display: flex;
          gap: 8px;
        }

        .rg-btn {
          text-decoration: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 14px;
          transition: 180ms ease;
        }

        .rg-btn-ghost {
          color: var(--rg-muted);
          border: 1px solid var(--rg-line);
        }

        .rg-btn-ghost:hover {
          color: var(--rg-accent);
          border-color: var(--rg-line-hot);
          background: rgba(240, 184, 208, 0.08);
        }

        .rg-btn-hot {
          color: #0a0a0e;
          background: var(--rg-accent);
          box-shadow: 0 8px 26px rgba(240, 184, 208, 0.28);
        }

        .rg-btn-hot:hover {
          opacity: 0.88;
          transform: translateY(-1px);
        }

        .rg-hero {
          margin-top: 20px;
          border: 1px solid var(--rg-line);
          border-radius: 26px;
          overflow: hidden;
          background: linear-gradient(135deg, rgba(20, 20, 28, 0.82), rgba(6, 6, 8, 0.92));
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          min-height: 640px;
        }

        .rg-copy {
          position: relative;
          padding: 62px 54px 44px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 24px;
        }

        .rg-kicker {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--rg-accent);
          border: 1px solid var(--rg-line-hot);
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(240, 184, 208, 0.08);
        }

        .rg-title {
          font-family: 'Chakra Petch', sans-serif;
          font-size: clamp(44px, 7vw, 82px);
          line-height: 0.94;
          letter-spacing: -0.03em;
          text-transform: uppercase;
          margin: 0;
          max-width: 560px;
        }

        .rg-title-em {
          color: var(--rg-accent);
        }

        .rg-sub {
          margin: 0;
          max-width: 510px;
          color: var(--rg-muted);
          font-size: 15px;
          line-height: 1.85;
        }

        .rg-hero-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .rg-stat-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .rg-stat {
          border: 1px solid var(--rg-line);
          background: var(--rg-panel);
          border-radius: 12px;
          padding: 13px 14px;
        }

        .rg-stat strong {
          display: block;
          font-family: 'JetBrains Mono', monospace;
          font-size: 19px;
          color: var(--rg-accent);
        }

        .rg-stat span {
          font-size: 11px;
          color: var(--rg-muted);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .rg-scene {
          border-left: 1px solid var(--rg-line);
          position: relative;
          isolation: isolate;
          padding: 30px;
          display: flex;
          align-items: stretch;
        }

        .rg-noise {
          position: absolute;
          inset: 0;
          opacity: 0.2;
          pointer-events: none;
          z-index: 0;
        }

        .rg-terminal {
          margin-top: auto;
          width: 100%;
          border: 1px solid var(--rg-line);
          border-radius: 16px;
          overflow: hidden;
          background: var(--rg-panel-strong);
          box-shadow: 0 24px 52px -20px rgba(0, 0, 0, 0.95);
          position: relative;
          z-index: 2;
        }

        .rg-term-head {
          display: flex;
          align-items: center;
          gap: 7px;
          border-bottom: 1px solid var(--rg-line);
          padding: 10px 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.42);
        }

        .rg-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .rg-term-body {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.62);
          padding: 16px 18px 20px;
        }

        .rg-term-good {
          color: var(--rg-good);
        }

        .rg-term-accent {
          color: var(--rg-accent);
        }

        .rg-cursor {
          display: inline-block;
          width: 8px;
          height: 1em;
          vertical-align: text-bottom;
          margin-left: 2px;
          border-radius: 1px;
          background: var(--rg-accent);
          animation: rg-blink 1.1s step-end infinite;
        }

        @keyframes rg-blink {
          50% { opacity: 0; }
        }

        .rg-strip {
          margin-top: 16px;
          border: 1px solid var(--rg-line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
          overflow: hidden;
        }

        .rg-marquee {
          white-space: nowrap;
          display: inline-flex;
          gap: 28px;
          padding: 12px 0;
          animation: rg-scroll 22s linear infinite;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        @keyframes rg-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        .rg-marquee span {
          color: rgba(255, 255, 255, 0.38);
        }

        .rg-marquee span b {
          color: var(--rg-accent);
          font-weight: 600;
        }

        .rg-section {
          margin-top: 24px;
          border: 1px solid var(--rg-line);
          border-radius: 22px;
          background: var(--rg-panel);
          padding: 28px;
        }

        .rg-section h2 {
          margin: 0 0 18px;
          font-size: clamp(24px, 3.6vw, 38px);
          font-family: 'Chakra Petch', sans-serif;
          letter-spacing: -0.02em;
          text-transform: uppercase;
        }

        .rg-features {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .rg-feature {
          border: 1px solid var(--rg-line);
          border-radius: 14px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          transition: 200ms ease;
        }

        .rg-feature:hover {
          border-color: var(--rg-line-hot);
          background: rgba(240, 184, 208, 0.08);
          transform: translateY(-2px);
        }

        .rg-feature h3 {
          margin: 0 0 6px;
          font-size: 16px;
          color: var(--rg-text);
        }

        .rg-feature p {
          margin: 0;
          color: var(--rg-muted);
          font-size: 13px;
          line-height: 1.65;
        }

        .rg-cta {
          margin-top: 24px;
          border: 1px solid var(--rg-line-hot);
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(240, 184, 208, 0.14), rgba(240, 184, 208, 0.05));
          padding: 30px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }

        .rg-cta h3 {
          margin: 0;
          font-family: 'Chakra Petch', sans-serif;
          font-size: clamp(28px, 4vw, 44px);
          text-transform: uppercase;
          letter-spacing: -0.02em;
          line-height: 1.02;
        }

        .rg-cta p {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.64);
          max-width: 460px;
          font-size: 14px;
          line-height: 1.6;
        }

        .rg-footer {
          padding: 28px 6px 6px;
          color: rgba(255, 255, 255, 0.4);
          font-size: 12px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        @media (max-width: 1020px) {
          .rg-hero {
            grid-template-columns: 1fr;
            min-height: unset;
          }
          .rg-scene {
            border-left: none;
            border-top: 1px solid var(--rg-line);
            min-height: 400px;
          }
        }

        @media (max-width: 760px) {
          .rg-shell {
            width: min(1180px, calc(100% - 20px));
            padding-top: 12px;
          }
          .rg-copy {
            padding: 28px 20px 24px;
          }
          .rg-scene {
            padding: 20px;
            min-height: 320px;
          }
          .rg-features {
            grid-template-columns: 1fr;
          }
          .rg-stat-row {
            grid-template-columns: 1fr;
          }
          .rg-section,
          .rg-cta {
            padding: 20px;
          }
          .rg-nav {
            top: 6px;
            border-radius: 12px;
            padding: 8px;
          }
          .rg-btn {
            padding: 8px 10px;
            font-size: 12px;
          }
        }
      `}</style>

      <div className="rg-page">
        <div className="rg-grid-overlay" />
        <div className="rg-shell">
          <nav className="rg-nav">
            <div className="rg-brand"><b>▸</b> Recgon</div>
            <div className="rg-nav-actions">
              <Link href="/login" className="rg-btn rg-btn-ghost">Sign in</Link>
              <Link href="/register" className="rg-btn rg-btn-hot">Get started</Link>
            </div>
          </nav>

          <section className="rg-hero">
            <div className="rg-copy">
              <div>
                <div className="rg-kicker">Founder Operating System</div>
                <h1 className="rg-title">
                  {ready ? (
                    <>
                      <DecryptedText text="The coach" animateOn="view" sequential speed={24} revealDirection="start" />
                      <br />
                      <DecryptedText text="solo founders" animateOn="view" sequential speed={24} revealDirection="start" />
                      <br />
                      <span className="rg-title-em">
                        <DecryptedText text="never hired." animateOn="view" sequential speed={24} revealDirection="start" />
                      </span>
                    </>
                  ) : (
                    <>
                      The coach
                      <br />
                      solo founders
                      <br />
                      <span className="rg-title-em">never hired.</span>
                    </>
                  )}
                  <TerminalCursor />
                </h1>
                <p className="rg-sub">
                  Recgon turns your product into a readable strategic system: code analysis, growth planning, feedback intelligence, and execution prompts in one loop.
                </p>
              </div>

              <div>
                <div className="rg-hero-actions">
                  <Link href="/register" className="rg-btn rg-btn-hot">Start free -&gt;</Link>
                  <Link href="/login" className="rg-btn rg-btn-ghost">Open dashboard</Link>
                </div>
                <div className="rg-stat-row">
                  {METRICS.map((metric) => (
                    <div key={metric.label} className="rg-stat">
                      <strong>{metric.value}</strong>
                      <span>{metric.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rg-scene">
              <div className="rg-noise">
                <FaultyTerminal
                  tint="#f0b8d0"
                  scale={1}
                  noiseAmp={0.35}
                  flickerAmount={0.45}
                  glitchAmount={1}
                  scanlineIntensity={0.5}
                  brightness={0.7}
                  pageLoadAnimation
                  mouseReact
                />
              </div>

              <div className="rg-terminal">
                <div className="rg-term-head">
                  <span className="rg-dot" style={{ background: '#ff5f56' }} />
                  <span className="rg-dot" style={{ background: '#ffbd2e' }} />
                  <span className="rg-dot" style={{ background: '#27c93f' }} />
                  <span style={{ marginLeft: 8 }}>recgon://analysis/session-41</span>
                </div>
                <div className="rg-term-body">
                  <div><span className="rg-term-accent">▸</span> Scanning repository: founder-app</div>
                  <div>stack: Next.js 15, Supabase, Stripe</div>
                  <div>market position: pre-product-market fit</div>
                  <div>highest risk: weak onboarding activation funnel</div>
                  <div>suggested focus: tighten first-run UX + ICP messaging</div>
                  <div className="rg-term-good">analysis complete in 4.2s</div>
                  <div style={{ marginTop: 8 }}>
                    recgon&gt; want the exact onboarding sequence?
                    <TerminalCursor />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="rg-strip">
            <div className="rg-marquee">
              {Array.from({ length: 2 }).map((_, i) => (
                <span key={`left-${i}`}>
                  <b>Codebase Analysis</b> -- Marketing Content -- Campaign Planning -- Feedback Radar -- Analytics Storytelling -- AI Mentor
                </span>
              ))}
            </div>
          </div>

          <section className="rg-section">
            <h2>One platform. Real leverage.</h2>
            <div className="rg-features">
              {FEATURES.map((feature) => (
                <article key={feature.name} className="rg-feature">
                  <h3>{feature.name}</h3>
                  <p>{feature.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rg-cta">
            <div>
              <h3>Build faster.<br />Decide sharper.</h3>
              <p>For solo founders who need strategy, execution, and clarity without hiring a full team.</p>
            </div>
            <Link href="/register" className="rg-btn rg-btn-hot">Launch with Recgon</Link>
          </section>

          <footer className="rg-footer">
            <span>Recgon -- built for builders who ship alone.</span>
            <span>Sign in / Register</span>
          </footer>
        </div>
      </div>
    </>
  );
}
