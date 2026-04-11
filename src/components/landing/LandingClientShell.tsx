'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import RecgonLogo from '@/components/RecgonLogo';
import DecryptedText from '@/components/landing/DecryptedText';
import SpotlightCard from '@/components/landing/SpotlightCard';
import BlurText from '@/components/landing/BlurText';
const FaultyTerminal = dynamic(() => import('@/components/landing/FaultyTerminal'), { ssr: false });
const Aurora = dynamic(() => import('@/components/landing/Aurora'), { ssr: false });

const AUDIENCE = ['Solo Founders', 'Small Teams', 'Indie Hackers', 'Early-Stage Startups', 'Side Projects'];

function RotatingWord({ word, decryptKey, started }: { word: string; decryptKey: number; started: boolean }) {
  if (!started) return <>{word}</>;
  return (
    <DecryptedText
      key={decryptKey}
      text={word}
      animateOn="view"
      sequential={true}
      speed={40}
      maxIterations={12}
      className="pink-decrypted-char"
      encryptedClassName="pink-encrypted-char"
    />
  );
}

function HeroText() {
  const [heroDone, setHeroDone] = useState(false);
  const [audIndex, setAudIndex] = useState(0);
  const [audKey, setAudKey] = useState(0);
  const [audStarted, setAudStarted] = useState(false);

  useEffect(() => {
    if (!heroDone) return;
    const interval = setInterval(() => {
      setAudStarted(true);
      setAudIndex(i => (i + 1) % AUDIENCE.length);
      setAudKey(k => k + 1);
    }, 2800);
    return () => clearInterval(interval);
  }, [heroDone]);

  return (
    <div className="hero-text" style={{ flex: 1, position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 40px' }}>
      <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '24px' }}>
        {heroDone
          ? <>// for <RotatingWord word={AUDIENCE[audIndex]} decryptKey={audKey} started={audStarted} /></>
          : '// for solo founders'
        }
      </div>
      <h1 style={{ fontFamily: MONO, fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 700, letterSpacing: '-1.5px', lineHeight: 1.15, margin: '0 0 28px', maxWidth: '820px' }}>
        {!heroDone ? (
          <DecryptedText
            text="The Coach Solo Founders Don't Have"
            animateOn="view"
            sequential={true}
            speed={40}
            maxIterations={12}
            className="decrypted-char"
            encryptedClassName="encrypted-char"
            onComplete={() => setHeroDone(true)}
          />
        ) : (
          <>The Coach <span style={{ color: PINK }}><RotatingWord word={AUDIENCE[audIndex]} decryptKey={audKey} started={audStarted} /></span> Don&apos;t Have</>
        )}
      </h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.6)', maxWidth: '560px', margin: '0 auto 48px', fontWeight: 400, animation: 'fadeInUp 0.8s ease 0.8s both' }}>
        Recgon analyzes your codebase, generates marketing content, plans campaigns,
        and turns user feedback into developer prompts — so you can stop guessing and start shipping.
      </p>
      <div className="cta-row" style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', animation: 'fadeInUp 0.8s ease 1.1s both' }}>
        <Link href="/register" className="btn-primary" style={{ padding: '16px 32px', borderRadius: '8px', fontSize: '16px', fontWeight: 600, color: '#000', textDecoration: 'none', background: PINK, display: 'inline-block' }}>
          Get Started Free
        </Link>
        <a href="#features" className="btn-ghost" style={{ padding: '16px 32px', borderRadius: '8px', fontSize: '16px', fontWeight: 500, color: '#fff', textDecoration: 'none', display: 'inline-block', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
          See How It Works
        </a>
      </div>
    </div>
  );
}

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const PINK = '#f0b8d0';

const features = [
  { icon: '{ }', title: 'Codebase Analysis', description: 'Drop in a local path or GitHub URL. Recgon walks your codebase and extracts a full product analysis in seconds.' },
  { icon: '///', title: 'Marketing Content', description: 'Generate platform-ready copy for Instagram, TikTok, and Google Ads — all grounded in what your product actually does.' },
  { icon: '>>>', title: 'Campaign Planning', description: 'Get structured campaign timelines, content calendars, and messaging strategies tailored to your product.' },
  { icon: '<!>', title: 'Feedback Analysis', description: 'Scrape Instagram comments or paste feedback manually. Get sentiment breakdowns and actionable developer prompts.' },
  { icon: '%_', title: 'Analytics Dashboard', description: 'Track your growth with GA4-powered dashboards and AI-generated insights about your traffic and engagement.' },
  { icon: '->', title: 'AI Mentor', description: 'Chat with an AI that knows your product inside out. Ask questions, get strategy advice, brainstorm features.' },
];

const steps = [
  { number: '01', title: 'Add Project', description: "Point Recgon at a local directory or paste a GitHub URL. That's it." },
  { number: '02', title: 'Analyze', description: 'AI walks your codebase, understands your product, and builds a comprehensive profile.' },
  { number: '03', title: 'Act', description: 'Generate marketing content, plan campaigns, analyze feedback, and grow — all from one place.' },
];

export default function LandingClientShell() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div style={{ background: '#000', color: '#fff', overflowX: 'hidden' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mobileGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .encrypted-char { color: rgba(240,184,208,0.55); }
        .decrypted-char  { color: #ffffff; }
        .pink-encrypted-char { color: rgba(240,184,208,0.35); }
        .pink-decrypted-char { color: #f0b8d0; }
        .btn-primary, .btn-ghost {
          transition: border-color 0.3s ease, transform 0.2s ease;
          touch-action: manipulation;
        }
        @media (hover: hover) {
          .btn-primary:hover, .btn-ghost:hover {
            border-color: rgba(255,255,255,0.16) !important;
            transform: translateY(-2px);
          }
        }
        @media (max-width: 768px) {
          .mcp-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .footer-row { flex-direction: column !important; gap: 16px !important; text-align: center !important; }
          .hero-header { padding: 20px 20px !important; }
          .hero-header nav { display: none !important; }
          .footer-nav { display: none !important; }
          .hero-text { padding: 0 20px !important; }
          .hero-text h1 { font-size: clamp(1.6rem, 8vw, 2.4rem) !important; }
          .hero-text p { font-size: 15px !important; }
          .hero-text .cta-row { flex-direction: column !important; align-items: center !important; }
          .hero-text .cta-row a { width: 100% !important; max-width: 280px !important; text-align: center !important; }
          .section-pad { padding: 72px 20px !important; }
          .section-pad-bottom { padding: 0 20px 72px !important; }
          .cta-section { padding: 100px 20px !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .mcp-terminal { display: none !important; }
          .mobile-coming-section { display: none !important; }
          .cta-desktop { display: none !important; }
          .cta-mobile { display: block !important; }
          /* Tap highlight */
          a, button { -webkit-tap-highlight-color: rgba(240,184,208,0.15); }
        }
      `}</style>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <FaultyTerminal
            tint={PINK}
            brightness={0.35}
            scale={1.2}
            gridMul={isMobile ? [1, 2] : [2, 1]}
            pageLoadAnimation={true}
            mouseReact={!isMobile}
            mouseStrength={0.2}
            curvature={0}
          />
        </div>
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 55%, rgba(0,0,0,0.75) 100%)',
        }} />

        <header className="hero-header" style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: PINK }}><RecgonLogo size={28} uid="logo-header" /></span>
          </div>
          <nav style={{ display: 'flex', gap: '12px' }}>
            <Link href="/login" className="btn-ghost" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, color: '#fff', textDecoration: 'none', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              Login
            </Link>
            <Link href="/register" className="btn-primary" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#000', textDecoration: 'none', background: PINK }}>
              Get Started
            </Link>
          </nav>
        </header>

        <HeroText />
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="section-pad" style={{ position: 'relative', background: '#000', padding: '120px 40px' }}>
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(240,184,208,0.13) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 30%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 30%, transparent 100%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'left', marginBottom: '56px' }}>
            <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '16px' }}>
              // capabilities
            </div>
            <BlurText
              text="Everything you need, nothing you don't"
              animateBy="words"
              delay={80}
              stepDuration={0.4}
              style={{ fontFamily: MONO, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}
            />
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {features.map((feature) => (
              <SpotlightCard key={feature.title} spotlightColor="rgba(240,184,208,0.12)" style={{ padding: '32px' }}>
                <div style={{ fontFamily: MONO, fontSize: '20px', color: PINK, marginBottom: '16px', fontWeight: 500 }}>{feature.icon}</div>
                <h3 style={{ fontFamily: MONO, fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.3px', marginBottom: '10px', color: '#fff', marginTop: 0 }}>{feature.title}</h3>
                <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'rgba(255,255,255,0.5)', fontWeight: 400, margin: 0 }}>{feature.description}</p>
              </SpotlightCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section className="section-pad" style={{ background: '#050505', padding: '120px 40px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'left', marginBottom: '56px' }}>
            <div style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '16px' }}>
              // workflow
            </div>
            <BlurText
              text="Three steps. Zero friction."
              animateBy="words"
              delay={100}
              stepDuration={0.4}
              style={{ fontFamily: MONO, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {steps.map((step) => (
              <SpotlightCard key={step.number} spotlightColor="rgba(240,184,208,0.12)" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', padding: '32px', borderRadius: '16px' }}>
                <div style={{ fontFamily: MONO, fontSize: '32px', fontWeight: 700, color: PINK, lineHeight: 1, flexShrink: 0, opacity: 0.65 }}>{step.number}</div>
                <div>
                  <h3 style={{ fontFamily: MONO, fontSize: '1.1rem', fontWeight: 600, letterSpacing: '-0.3px', marginBottom: '8px', color: '#fff', marginTop: 0 }}>{step.title}</h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'rgba(255,255,255,0.5)', fontWeight: 400, margin: 0 }}>{step.description}</p>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Claude MCP ────────────────────────────────────────────────────── */}
      <section className="section-pad-bottom" style={{ background: '#000', padding: '0 40px 120px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Section tag */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '1.4px' }}>// claude integration</span>
          </div>

          <div className="mcp-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '72px', alignItems: 'start' }}>

            {/* Left: heading + workflow steps */}
            <div>
              <h2 style={{ fontFamily: MONO, fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.15, color: '#fff', marginTop: 0, marginBottom: '16px' }}>
                Claude&apos;s <span style={{ color: PINK }}>Best Friend</span>
              </h2>
              <p style={{ fontSize: '15px', lineHeight: 1.7, color: 'rgba(255,255,255,0.45)', margin: '0 0 40px' }}>
                Recgon plugs into Claude Code via MCP. Claude reads your product analysis, picks up actionable next steps, implements them, and marks them done — all tracked in Recgon.
              </p>

              {/* Workflow steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {[
                  { num: '01', fn: 'list_projects()', desc: 'Claude sees all your analyzed projects' },
                  { num: '02', fn: 'get_actionable_items("my-app")', desc: 'Gets prioritized next steps to tackle' },
                  { num: '03', fn: 'mark_item_complete({ ... })', desc: 'Closes the loop — tracked in Recgon' },
                ].map(({ num, fn, desc }) => (
                  <div key={num} style={{ display: 'flex', gap: '0' }}>
                    <SpotlightCard spotlightColor="rgba(240,184,208,0.12)" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '14px 18px', borderRadius: '10px', flex: 1 }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(240,184,208,0.15)', border: '1px solid rgba(240,184,208,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                        <span style={{ fontFamily: MONO, fontSize: '9px', fontWeight: 700, color: PINK }}>{num}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: '12.5px', color: PINK, marginBottom: '4px', letterSpacing: '-0.1px' }}>{fn}</div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </SpotlightCard>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '28px', fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.18)', paddingLeft: '4px' }}>
                {'// You stay in control. Claude asks before it acts.'}
              </div>
            </div>

            {/* Right: gradient-bordered terminal */}
            <div className="mcp-terminal" style={{ position: 'relative' }}>
              {/* Glow behind terminal */}
              <div style={{ position: 'absolute', inset: '-1px', borderRadius: '15px', background: `linear-gradient(135deg, rgba(240,184,208,0.35) 0%, rgba(240,184,208,0.05) 40%, rgba(255,255,255,0.04) 100%)`, zIndex: 0 }} />
              <div style={{ position: 'relative', zIndex: 1, borderRadius: '14px', overflow: 'hidden', background: '#0d0d0d' }}>
                {/* Title bar */}
                <div style={{ background: '#191919', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', flexShrink: 0 }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', flexShrink: 0 }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.28)', marginLeft: '12px' }}>claude — recgon-mcp — zsh</span>
                </div>
                {/* Terminal body */}
                <div style={{ padding: '28px 32px', fontFamily: MONO, fontSize: '12.5px', lineHeight: 1.85 }}>
                  <div><span style={{ color: 'rgba(255,255,255,0.2)' }}>{'$ '}</span><span style={{ color: PINK }}>{'list_projects'}</span><span style={{ color: 'rgba(255,255,255,0.55)' }}>{'()'}</span></div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', paddingLeft: '2px' }}>{'→ [{ name: "my-saas", hasAnalysis: true }]'}</div>
                  <div style={{ height: '14px' }} />

                  <div><span style={{ color: 'rgba(255,255,255,0.2)' }}>{'$ '}</span><span style={{ color: PINK }}>{'get_actionable_items'}</span><span style={{ color: 'rgba(255,255,255,0.55)' }}>{'('}</span><span style={{ color: '#98c379' }}>{"\"my-saas\""}</span><span style={{ color: 'rgba(255,255,255,0.55)' }}>{')'}</span></div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', paddingLeft: '2px' }}>{'→ totalActionable: 3'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.22)', paddingLeft: '14px' }}>{'[0] Add auth rate limiting'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.22)', paddingLeft: '14px' }}>{'[1] Set up error monitoring'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.22)', paddingLeft: '14px' }}>{'[2] Write onboarding copy'}</div>
                  <div style={{ height: '14px' }} />

                  <div style={{ color: 'rgba(255,255,255,0.18)' }}>{'# implementing [0]...'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.22)', paddingLeft: '14px' }}>{'→ auth middleware added'}</div>
                  <div style={{ height: '14px' }} />

                  <div><span style={{ color: 'rgba(255,255,255,0.2)' }}>{'$ '}</span><span style={{ color: PINK }}>{'mark_item_complete'}</span><span style={{ color: 'rgba(255,255,255,0.55)' }}>{'({'}</span></div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', paddingLeft: '20px' }}>{'projectId: '}<span style={{ color: '#98c379' }}>{"\"my-saas\""}</span>{','}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', paddingLeft: '20px' }}>{'itemType: '}<span style={{ color: '#98c379' }}>{"\"next-step\""}</span>{', index: '}<span style={{ color: '#d19a66' }}>{'0'}</span>{','}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', paddingLeft: '20px' }}>{'evidence: '}<span style={{ color: '#98c379' }}>{"\"added rate limiter\""}</span></div>
                  <div style={{ color: 'rgba(255,255,255,0.55)' }}>{'  })'}</div>
                  <div style={{ height: '4px' }} />
                  <div style={{ color: '#28c840' }}>{'✓ tracked in Recgon'}</div>
                  <div style={{ height: '4px' }} />
                  <div><span style={{ color: 'rgba(255,255,255,0.2)' }}>{'$ '}</span><span style={{ display: 'inline-block', width: '8px', height: '14px', background: 'rgba(255,255,255,0.4)', verticalAlign: 'middle', animation: 'none' }} /></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <Aurora colorStops={['#1a0a10', '#f0b8d0', '#1a0a10']} amplitude={1.0} blend={0.4} speed={0.5} />
        </div>
        <div className="cta-section" style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '160px 40px' }}>
          {/* Desktop CTA */}
          <div className="cta-desktop">
            <h2 style={{ fontFamily: MONO, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-1px', color: '#fff', marginTop: 0, marginBottom: '24px' }}>
              <BlurText text="Ready to stop guessing?" animateBy="words" delay={100} stepDuration={0.4} />
            </h2>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
              Join solo founders who use Recgon to understand their product, reach their users, and grow faster.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" className="btn-primary" style={{ padding: '16px 40px', borderRadius: '8px', fontSize: '16px', fontWeight: 600, color: '#000', textDecoration: 'none', background: PINK, display: 'inline-block' }}>
                Get Started Free
              </Link>
              <Link href="/login" className="btn-ghost" style={{ padding: '16px 40px', borderRadius: '8px', fontSize: '16px', fontWeight: 500, color: '#fff', textDecoration: 'none', display: 'inline-block', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' }}>
                Login
              </Link>
            </div>
          </div>
          {/* Mobile CTA */}
          <div className="cta-mobile" style={{ display: 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px' }}>
              // coming soon
            </div>
            <h2 style={{ fontFamily: MONO, fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', color: '#fff', marginTop: 0, marginBottom: '16px' }}>
              Coming to Mobile Soon
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', maxWidth: '300px', margin: '0 auto', lineHeight: 1.7 }}>
              We&apos;re building a native mobile experience. Until then, Recgon is best on desktop.
            </p>
          </div>
        </div>
      </section>

      {/* ── Mobile Coming Soon (mobile only) ─────────────────────────────── */}
      <section className="mobile-coming-section" style={{ display: 'none', background: '#050505', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '72px 32px', textAlign: 'center' }}>
        <div style={{ animation: 'mobileGlow 3s ease-in-out infinite', marginBottom: '24px' }}>
          <span style={{ fontFamily: MONO, fontSize: '28px', color: PINK }}>{'[]'}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: '10px', fontWeight: 700, color: PINK, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '16px' }}>
          // mobile app
        </div>
        <h2 style={{ fontFamily: MONO, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 16px' }}>
          Coming to Mobile Soon
        </h2>
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'rgba(255,255,255,0.45)', maxWidth: '300px', margin: '0 auto' }}>
          A native mobile experience is on the way. For now, Recgon works best on desktop.
        </p>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="footer-row" style={{ background: '#000', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: PINK }}><RecgonLogo size={22} uid="logo-footer" /></span>
        </div>
        <p style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
          recgon — built for builders
        </p>
        <div className="footer-nav" style={{ display: 'flex', gap: '20px' }}>
          <Link href="/login" style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Login</Link>
          <Link href="/register" style={{ fontFamily: MONO, fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>Register</Link>
        </div>
      </footer>
    </div>
  );
}
