'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Code, BarChart3, ListTodo, UserCheck, ShieldCheck, Terminal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import RecgonLogo from '@/components/RecgonLogo';
import DecryptedText from './DecryptedText';
import LandingDotField from './LandingDotField';

const Aurora = dynamic(() => import('./Aurora'), { ssr: false });

const AUDIENCE_KEYS = [
  'smallTeams',
  'earlyStartups',
  'indieHackers',
  'foundingTeams',
  'sideProjects',
  'soloFounders',
  'productTeams',
] as const;

const DEVICE_KEYS = ['laptop', 'desktop', 'mac', 'pc'] as const;

const CAPABILITY_KEYS = [
  { Icon: Code, key: 'codebase' },
  { Icon: BarChart3, key: 'analytics' },
  { Icon: ListTodo, key: 'minting' },
  { Icon: UserCheck, key: 'assign' },
  { Icon: ShieldCheck, key: 'verification' },
  { Icon: Terminal, key: 'terminal' },
] as const;

const STEP_KEYS = [
  { num: '01', key: 'step1' },
  { num: '02', key: 'step2' },
  { num: '03', key: 'step3' },
] as const;

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4'] as const;

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) { setVisible(true); obs.disconnect(); break; }
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity 0.6s var(--ease-out, ease) ${delay}ms, transform 0.6s var(--ease-out, ease) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

type TermLine = { kind: 'cmd' | 'note' | 'out' | 'ok'; text: string };

function TerminalDemo() {
  const t = useTranslations('landing.mobile.terminal');
  const TERM_SCRIPT: TermLine[] = useMemo(
    () => [
      { kind: 'cmd', text: '/analyze acme/storefront' },
      { kind: 'note', text: t('script.note1') },
      { kind: 'out', text: t('script.out1') },
      { kind: 'note', text: t('script.note2') },
      { kind: 'ok', text: t('script.ok') },
    ],
    [t],
  );
  const { ref, visible } = useReveal<HTMLDivElement>();
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const reduce = typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setLineIdx(TERM_SCRIPT.length);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const current = TERM_SCRIPT[lineIdx];

    if (!current) {
      // Hold the finished frame for a beat, then reset and replay.
      timer = setTimeout(() => {
        setLineIdx(0);
        setCharIdx(0);
        setCycle((c) => c + 1);
      }, 4200);
    } else if (charIdx < current.text.length) {
      // Commands type slower so the prompt feels like a user; outputs flush
      // fast so the rhythm reads like a real CLI.
      const delay =
        current.kind === 'cmd' ? 42 :
        current.kind === 'note' ? 14 :
        18;
      timer = setTimeout(() => setCharIdx(charIdx + 1), delay);
    } else {
      // Pause between lines so the eye can settle.
      const pause = current.kind === 'cmd' ? 420 : 280;
      timer = setTimeout(() => {
        setLineIdx(lineIdx + 1);
        setCharIdx(0);
      }, pause);
    }

    return () => { if (timer) clearTimeout(timer); };
  }, [visible, lineIdx, charIdx, cycle, TERM_SCRIPT]);

  const lines = TERM_SCRIPT.map((l, i) => {
    if (i < lineIdx) return { ...l, text: l.text };
    if (i === lineIdx) return { ...l, text: l.text.slice(0, charIdx) };
    return null;
  });

  return (
    <div ref={ref} className="mlnd-term">
      <div className="mlnd-term-bar">
        <span className="mlnd-term-dot" data-c="r" />
        <span className="mlnd-term-dot" data-c="y" />
        <span className="mlnd-term-dot" data-c="g" />
        <span className="mlnd-term-bar-title">{t('barTitle')}</span>
      </div>
      <div className="mlnd-term-body">
        {lines.map((l, i) => {
          if (!l) return null;
          if (l.kind === 'cmd') {
            return (
              <div key={i} className="mlnd-term-line mlnd-term-cmd">
                <span className="mlnd-term-prompt">$</span>
                <span>{l.text}</span>
                {i === lineIdx && (
                  <span className="mlnd-term-cursor mlnd-term-cursor-inline" aria-hidden="true" />
                )}
              </div>
            );
          }
          const cls =
            l.kind === 'note' ? 'mlnd-term-note' :
            l.kind === 'out' ? 'mlnd-term-out' :
            'mlnd-term-ok';
          return (
            <div key={i} className={`mlnd-term-line ${cls}`}>
              {l.text}
            </div>
          );
        })}
        {lineIdx >= TERM_SCRIPT.length && (
          <div className="mlnd-term-line mlnd-term-cmd">
            <span className="mlnd-term-prompt">$</span>
            <span className="mlnd-term-cursor" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

function RotatingWord({ word, decryptKey, started }: { word: string; decryptKey: number; started: boolean }) {
  if (!started) return <>{word}</>;
  return (
    <DecryptedText
      key={decryptKey}
      text={word}
      animateOn="view"
      sequential
      speed={36}
      maxIterations={12}
      className="mlnd-rot-decoded"
      encryptedClassName="mlnd-rot-encoded"
    />
  );
}

export default function MobileLanding() {
  const t = useTranslations('landing.mobile');
  const tHero = useTranslations('landing.hero');
  const AUDIENCE = useMemo(
    () => AUDIENCE_KEYS.map((k) => tHero(`audience.${k}`)),
    [tHero],
  );
  const DEVICES = useMemo(
    () => DEVICE_KEYS.map((k) => t(`final.device.${k}`)),
    [t],
  );
  const [heroDone, setHeroDone] = useState(false);
  const [audIdx, setAudIdx] = useState(0);
  const [audKey, setAudKey] = useState(0);
  const [audStarted, setAudStarted] = useState(false);
  const [devIdx, setDevIdx] = useState(0);
  const [devKey, setDevKey] = useState(0);
  const [devStarted, setDevStarted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [diving, setDiving] = useState(false);

  const handleDive = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setDiving(true);
    document
      .getElementById('mlnd-features')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setDiving(false), 720);
  };

  // Audience rotator — fires only after the hero decrypt finishes so the
  // first paint is "for small teams" cleanly.
  useEffect(() => {
    if (!heroDone) return;
    const id = setInterval(() => {
      setAudStarted(true);
      setAudIdx((i) => (i + 1) % AUDIENCE_KEYS.length);
      setAudKey((k) => k + 1);
    }, 2800);
    return () => clearInterval(id);
  }, [heroDone]);

  // Device rotator — independent loop for the final CTA's "Built for your X"
  // line. Doesn't wait for the hero since the CTA is far below the fold.
  useEffect(() => {
    const id = setInterval(() => {
      setDevStarted(true);
      setDevIdx((i) => (i + 1) % DEVICE_KEYS.length);
      setDevKey((k) => k + 1);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  // Touch-only "tap pulse" for any .glass-card — fires the hover-lift
  // animation on pointerdown and self-cancels on animationend. This is
  // what desktop `:hover` is supposed to feel like on a phone.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const target = e.target as HTMLElement | null;
      const card = target?.closest?.('.glass-card') as HTMLElement | null;
      if (!card || card.classList.contains('is-tap-pulse')) return;
      card.classList.add('is-tap-pulse');
      const clear = () => {
        card.classList.remove('is-tap-pulse');
        card.removeEventListener('animationend', clear);
      };
      card.addEventListener('animationend', clear);
      // Belt-and-braces — if animationend doesn't fire (interrupted,
      // off-screen, etc.) make sure the class is gone in <600ms.
      window.setTimeout(clear, 600);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  return (
    <div className="mlnd-root dark">
      {/* Mobile is dark-by-default. Scoping `dark` locally flips theme tokens
          without touching next-themes. Body-bg override keeps overscroll black. */}
      <style>{`
        html, body { background: #000 !important; color-scheme: dark; }
      `}</style>

      {/* ── Hero (bottom-anchored, full viewport) ──────────────────────── */}
      <section className="mlnd-hero">
        <div className="mlnd-hero-aurora" aria-hidden="true">
          <Aurora colorStops={['#0a0205', '#c2357a', '#0a0205']} amplitude={0.9} blend={0.55} speed={0.35} />
        </div>
        <div className="mlnd-hero-bg" aria-hidden="true">
          <LandingDotField mode="parent" spacing={20} reach={160} autoRoam ignorePointer baseRadius={1} maxRadius={3.4} />
        </div>
        <div className="mlnd-hero-fade" aria-hidden="true" />

        <header className="mlnd-header">
          <span className="mlnd-brand"><RecgonLogo size={22} uid="mlnd-logo-h" /></span>
          <span className="mlnd-vtag">{'// v2'}</span>
        </header>

        <div className="mlnd-hero-spacer" />

        <div className="mlnd-hero-stack">
          <div className="recgon-label mlnd-aud" aria-live="polite">
            {t('hero.forPrefix')} {heroDone ? (
              <RotatingWord word={AUDIENCE[audIdx]} decryptKey={audKey} started={audStarted} />
            ) : AUDIENCE[0]}
          </div>

          <h1 className="mlnd-h1">
            {!heroDone ? (
              <DecryptedText
                text={t('hero.titleStatic')}
                animateOn="view"
                sequential
                speed={36}
                maxIterations={12}
                className="mlnd-h1-decoded"
                encryptedClassName="mlnd-h1-encoded"
                onComplete={() => setHeroDone(true)}
              />
            ) : (
              <>
                {t('hero.titlePrefix')}{' '}
                <span className="mlnd-h1-accent">
                  <RotatingWord
                    word={`${AUDIENCE[audIdx]}.`}
                    decryptKey={audKey + 1000}
                    started={audStarted}
                  />
                </span>
              </>
            )}
          </h1>

          <p className="mlnd-sub">
            {t('hero.subtitle')}
          </p>

          <a
            href="#mlnd-features"
            className={`mlnd-cta-ghost${diving ? ' is-diving' : ''}`}
            onClick={handleDive}
          >
            {t('hero.seeWhat')}{' '}
            <span className="mlnd-cta-arrow" aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="mlnd-features" className="mlnd-section mlnd-features">
        <div className="mlnd-section-inner">
          <Reveal>
            <span className="recgon-label">{t('features.label')}</span>
            <h2 className="mlnd-h2">
              {t('features.titleLine1')}
              <br />
              <span className="mlnd-h2-soft">{t('features.titleLine2')}</span>
            </h2>
          </Reveal>

          <div className="mlnd-cap-list">
            {CAPABILITY_KEYS.map(({ Icon, key }, i) => (
              <Reveal key={key} delay={i * 60}>
                <article className="glass-card mlnd-cap">
                  <div className="mlnd-cap-head">
                    <span className="mlnd-cap-num">[{String(i + 1).padStart(2, '0')}]</span>
                    <span className="mlnd-cap-icon"><Icon size={18} strokeWidth={2} /></span>
                  </div>
                  <h3 className="mlnd-cap-title">{t(`features.${key}.title`)}</h3>
                  <p className="mlnd-cap-body">{t(`features.${key}.body`)}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works (vertical timeline) ───────────────────────────── */}
      <section className="mlnd-section mlnd-how">
        <Reveal>
          <span className="recgon-label">{t('workflow.label')}</span>
          <h2 className="mlnd-h2">
            {t('workflow.titleLine1')}
            <br />
            <span className="mlnd-h2-soft">{t('workflow.titleLine2')}</span>
          </h2>
        </Reveal>

        <div className="mlnd-timeline">
          <div className="mlnd-timeline-rail" aria-hidden="true" />
          {STEP_KEYS.map((s, i) => (
            <Reveal key={s.num} delay={i * 100}>
              <div className="mlnd-step" data-last={i === STEP_KEYS.length - 1 ? 'true' : 'false'}>
                <div className="mlnd-step-dot" aria-hidden="true" />
                <span className="recgon-label mlnd-step-label">{t('workflow.stepLabel', { num: s.num })}</span>
                <h3 className="mlnd-step-title">{t(`workflow.${s.key}.title`)}</h3>
                <p className="mlnd-step-body">{t(`workflow.${s.key}.body`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Terminal (Claude / slash commands) ─────────────────────────── */}
      <section className="mlnd-section">
        <Reveal>
          <span className="recgon-label">{t('terminal.label')}</span>
          <h2 className="mlnd-h2">
            {t('terminal.titleLine1')}
            <br />
            <span className="mlnd-h2-soft">{t('terminal.titleLine2')}</span>
          </h2>
          <p className="mlnd-lede">
            {t('terminal.lede')}
          </p>
        </Reveal>

        <Reveal delay={80}>
          <TerminalDemo />
        </Reveal>

        <div className="mlnd-mcp-note">{t('terminal.mcpNote')}</div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="mlnd-section mlnd-faq">
        <div className="mlnd-section-inner">
          <Reveal>
            <span className="recgon-label">{t('faq.label')}</span>
            <h2 className="mlnd-h2">{t('faq.title')}</h2>
          </Reveal>

          <div className="mlnd-faq-list">
            {FAQ_KEYS.map((key, i) => {
              const isOpen = openFaq === i;
              return (
                <Reveal key={key} delay={i * 60}>
                  <div className={`glass-card mlnd-faq-item ${isOpen ? 'is-open' : ''}`}>
                    <button
                      type="button"
                      className="mlnd-faq-trigger"
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                    >
                      <span>{t(`faq.${key}.q`)}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isOpen && <p className="mlnd-faq-body">{t(`faq.${key}.a`)}</p>}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA — Aurora-backed "Built for your <device>" ────────── */}
      <section className="mlnd-final">
        <div className="mlnd-final-aurora" aria-hidden="true">
          <Aurora colorStops={['#1a0a10', '#f0b8d0', '#1a0a10']} amplitude={0.7} blend={0.4} speed={0.5} />
        </div>
        <div className="mlnd-final-veil" aria-hidden="true" />
        <div className="mlnd-final-inner">
          <Reveal>
            <span className="recgon-label mlnd-final-tag">{t('final.tag')}</span>
            <h2 className="mlnd-final-title">
              {t('final.titlePrefix')}
              <br />
              <span className="mlnd-final-accent">
                <RotatingWord word={DEVICES[devIdx]} decryptKey={devKey} started={devStarted} />
              </span>
            </h2>
            <p className="mlnd-final-body">
              {t('final.body')}
            </p>
            <div className="mlnd-final-pill">
              <span className="mlnd-final-pill-glyph">$</span>
              <span className="mlnd-final-pill-text">{t('final.pillText')}</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mlnd-foot">
        <span className="mlnd-foot-brand"><RecgonLogo size={22} uid="mlnd-logo-f" /></span>
        <p className="mlnd-foot-line">{t('footer.tagline')}</p>
      </footer>

      <style>{`
        .mlnd-root {
          background: var(--bg-deep);
          color: var(--txt-pure);
          min-height: 100vh;
          min-height: 100svh;
          overflow-x: hidden;
          -webkit-tap-highlight-color: rgba(var(--signature-rgb), 0.2);
        }

        /* ─────────── HERO ─────────── */
        .mlnd-hero {
          position: relative;
          min-height: 100svh;
          overflow: hidden;
          isolation: isolate;
          display: flex;
          flex-direction: column;
        }
        .mlnd-hero-aurora {
          position: absolute;
          inset: -10% -10% 0 -10%;
          z-index: 0;
          pointer-events: none;
          opacity: 0.85;
          mask-image: linear-gradient(to bottom, black 0%, black 55%, transparent 92%);
          -webkit-mask-image: linear-gradient(to bottom, black 0%, black 55%, transparent 92%);
        }
        .mlnd-hero-bg {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.65;
          /* Fade the dot field away from edges so the lensing hotspot
             never visually grazes the screen border. */
          -webkit-mask-image: radial-gradient(ellipse 78% 62% at 50% 50%, black 30%, transparent 100%);
          mask-image: radial-gradient(ellipse 78% 62% at 50% 50%, black 30%, transparent 100%);
        }
        .mlnd-hero-bg > canvas { width: 100%; height: 100%; }
        .mlnd-hero-fade {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: linear-gradient(to bottom, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.05) 32%, rgba(0,0,0,0.78) 88%, rgba(0,0,0,0.95) 100%);
        }

        .mlnd-header {
          position: relative;
          z-index: 3;
          /* Top padding honors iOS dynamic island / notch via the
             safe-area inset. The aurora + dot field underneath extend
             into that area (inset:-10% on .mlnd-hero-aurora), so the
             dynamic island region paints aurora, not a flat black bar. */
          padding: calc(env(safe-area-inset-top, 0px) + 18px) 18px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .mlnd-brand { color: var(--signature); display: inline-flex; }
        .mlnd-vtag {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--signature);
          opacity: 0.7;
          font-weight: 700;
        }

        .mlnd-hero-spacer { flex: 1; }

        .mlnd-hero-stack {
          position: relative;
          z-index: 3;
          padding: 0 18px 32px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
        .mlnd-aud {
          margin: 0 0 18px;
          opacity: 0.9;
          font-size: 10px;
          letter-spacing: 1.6px;
        }
        .mlnd-rot-encoded { color: rgba(var(--signature-rgb), 0.35); }
        .mlnd-rot-decoded { color: var(--signature); }

        .mlnd-h1 {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(1.9rem, 9vw, 2.6rem);
          font-weight: 700;
          letter-spacing: -1.2px;
          line-height: 1.08;
          margin: 0 0 18px;
          color: var(--txt-pure);
        }
        .mlnd-h1-encoded { color: rgba(var(--signature-rgb), 0.55); }
        .mlnd-h1-decoded { color: var(--txt-pure); }
        .mlnd-h1-accent { color: var(--signature); }

        .mlnd-sub {
          font-size: 14px;
          line-height: 1.65;
          color: var(--txt-muted);
          margin: 0 0 24px;
          max-width: 34ch;
        }

        .mlnd-cta-ghost {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 52px;
          border-radius: 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 500;
          color: var(--txt-pure);
          text-decoration: none;
          background: rgba(var(--signature-rgb), 0.05);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          touch-action: manipulation;
          transition: transform 0.15s ease, background 0.25s ease, border-color 0.25s ease;
        }
        .mlnd-cta-ghost:active { transform: scale(0.98); }
        .mlnd-cta-arrow {
          display: inline-block;
          margin-left: 4px;
          will-change: transform, opacity;
        }
        .mlnd-cta-ghost.is-diving {
          background: rgba(var(--signature-rgb), 0.12);
          border-color: rgba(var(--signature-rgb), 0.42);
        }
        .mlnd-cta-ghost.is-diving .mlnd-cta-arrow {
          animation: mlnd-cta-dive 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes mlnd-cta-dive {
          0%   { transform: translateY(0);   opacity: 1; }
          38%  { transform: translateY(14px); opacity: 0; }
          39%  { transform: translateY(-14px); opacity: 0; }
          70%  { transform: translateY(-2px); opacity: 1; }
          100% { transform: translateY(0);   opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mlnd-cta-ghost.is-diving .mlnd-cta-arrow { animation: none; }
        }

        /* ─────────── Generic section ─────────── */
        .mlnd-section {
          position: relative;
          background: var(--bg-deep);
          padding: 84px 18px 72px;
        }
        .mlnd-section.mlnd-features { background: var(--bg-deep); }
        /* Subtle alt-band via a slightly elevated dark substrate — pure
           bg-deep everywhere would flatten the section rhythm. */
        .mlnd-section.mlnd-how,
        .mlnd-section.mlnd-faq {
          background: linear-gradient(180deg, var(--bg-deep) 0%, rgba(var(--signature-rgb), 0.03) 100%);
        }

        .mlnd-section-inner {
          position: relative;
          z-index: 1;
        }

        .mlnd-h2 {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 1.55rem;
          font-weight: 700;
          letter-spacing: -0.6px;
          line-height: 1.15;
          color: var(--txt-pure);
          margin: 0 0 36px;
        }
        .mlnd-h2-soft { color: var(--txt-muted); }
        .mlnd-lede {
          margin: -16px 0 28px;
          font-size: 14px;
          line-height: 1.6;
          color: var(--txt-muted);
        }

        /* ─────────── Capabilities (v2 glass-card) ─────────── */
        .mlnd-cap-list { display: flex; flex-direction: column; gap: 14px; }
        /* glass-card class provides the surface; this override just tightens
           the padding for a mobile-friendly density. */
        .mlnd-cap {
          padding: 20px !important;
          border-radius: 14px !important;
        }
        .mlnd-cap-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .mlnd-cap-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          color: var(--signature);
          letter-spacing: 1px;
          opacity: 0.85;
        }
        .mlnd-cap-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: rgba(var(--signature-rgb), 0.12);
          color: var(--signature);
        }
        .mlnd-cap-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.2px;
          color: var(--txt-pure);
          margin: 0 0 6px;
        }
        .mlnd-cap-body {
          font-size: 13px;
          line-height: 1.6;
          color: var(--txt-muted);
          margin: 0;
        }

        /* ─────────── Timeline ─────────── */
        .mlnd-timeline {
          position: relative;
          padding-left: 38px;
        }
        .mlnd-timeline-rail {
          position: absolute;
          left: 13px;
          top: 8px;
          bottom: 8px;
          width: 1px;
          background: linear-gradient(to bottom,
            rgba(var(--signature-rgb), 0.5) 0%,
            rgba(var(--signature-rgb), 0.15) 50%,
            rgba(var(--signature-rgb), 0) 100%);
          overflow: hidden;
        }
        .mlnd-timeline-rail::after {
          content: '';
          position: absolute;
          left: -1px;
          right: -1px;
          height: 40%;
          background: linear-gradient(to bottom,
            transparent 0%,
            rgba(var(--signature-rgb), 0.85) 50%,
            transparent 100%);
          filter: blur(0.5px);
          animation: mlndRailSweep 3.6s cubic-bezier(0.6, 0, 0.4, 1) infinite;
        }
        @keyframes mlndRailSweep {
          0%   { transform: translateY(-100%); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(260%); opacity: 0; }
        }
        .mlnd-step {
          position: relative;
          padding-bottom: 36px;
        }
        .mlnd-step[data-last='true'] { padding-bottom: 0; }
        .mlnd-step-dot {
          position: absolute;
          left: -32px;
          top: 4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--bg-deep);
          border: 2px solid var(--signature);
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.12);
          animation: mlndDotPulse 2.8s ease-in-out infinite;
        }
        .mlnd-step:nth-of-type(2) .mlnd-step-dot { animation-delay: 0.6s; }
        .mlnd-step:nth-of-type(3) .mlnd-step-dot { animation-delay: 1.2s; }
        @keyframes mlndDotPulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.10), 0 0 0 0 rgba(var(--signature-rgb), 0.0); }
          50%      { box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.18), 0 0 14px 2px rgba(var(--signature-rgb), 0.35); }
        }
        .mlnd-step-label {
          margin: 0 0 6px;
          opacity: 0.85;
          font-size: 11px;
          letter-spacing: 1.2px;
        }
        .mlnd-step-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 16px;
          font-weight: 700;
          color: var(--txt-pure);
          margin: 0 0 6px;
          letter-spacing: -0.2px;
        }
        .mlnd-step-body {
          font-size: 13px;
          line-height: 1.6;
          color: var(--txt-muted);
          margin: 0;
        }

        /* ─────────── Terminal ─────────── */
        .mlnd-term {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          background: var(--bg-deep);
          border: 1px solid rgba(var(--signature-rgb), 0.18);
          box-shadow: 0 30px 60px -30px rgba(var(--signature-rgb), 0.25);
        }
        .mlnd-term-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          background: rgba(var(--signature-rgb), 0.05);
          border-bottom: 1px solid rgba(var(--signature-rgb), 0.1);
        }
        .mlnd-term-dot { width: 9px; height: 9px; border-radius: 50%; }
        .mlnd-term-dot[data-c='r'] { background: #ff5f57; }
        .mlnd-term-dot[data-c='y'] { background: #febc2e; }
        .mlnd-term-dot[data-c='g'] { background: #28c840; }
        .mlnd-term-bar-title {
          margin-left: 10px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
        }
        .mlnd-term-body {
          padding: 18px 18px 20px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          line-height: 1.85;
        }
        .mlnd-term-line { display: flex; gap: 8px; }
        .mlnd-term-prompt { color: var(--signature); flex-shrink: 0; font-weight: 700; }
        .mlnd-term-cmd { color: var(--txt-pure); }
        .mlnd-term-note { color: var(--txt-faint); font-style: italic; padding-left: 14px; opacity: 0.85; }
        .mlnd-term-out { color: var(--txt-muted); padding-left: 14px; }
        .mlnd-term-ok { color: var(--success); padding-left: 14px; font-weight: 600; }
        .mlnd-term-cursor {
          display: inline-block;
          width: 7px;
          height: 12px;
          background: var(--signature);
          vertical-align: middle;
          animation: mlndBlink 1s steps(1) infinite;
        }
        .mlnd-term-cursor-inline {
          width: 6px;
          height: 11px;
          margin-left: 4px;
          opacity: 0.85;
        }
        @keyframes mlndBlink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        .mlnd-mcp-note {
          margin-top: 20px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          text-align: center;
        }

        /* ─────────── FAQ (v2 glass-card) ─────────── */
        .mlnd-faq-list { display: flex; flex-direction: column; gap: 10px; }
        .mlnd-faq-item {
          padding: 0 !important;
          border-radius: 14px !important;
          overflow: hidden;
        }
        .mlnd-faq-trigger {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          padding: 18px 18px 18px 20px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 700;
          color: var(--txt-pure);
          letter-spacing: -0.1px;
          cursor: pointer;
          box-sizing: border-box;
        }
        .mlnd-faq-trigger svg {
          color: var(--signature);
          transition: transform 0.25s var(--ease-out, ease);
          flex-shrink: 0;
        }
        .mlnd-faq-item.is-open .mlnd-faq-trigger svg { transform: rotate(180deg); }
        .mlnd-faq-body {
          margin: 0;
          padding: 0 18px 18px 20px;
          font-size: 13px;
          line-height: 1.65;
          color: var(--txt-muted);
        }

        /* ─────────── Final CTA ─────────── */
        .mlnd-final {
          position: relative;
          overflow: hidden;
          background: #000;
          isolation: isolate;
        }
        .mlnd-final-aurora {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .mlnd-final-veil {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.85) 100%);
          pointer-events: none;
        }
        .mlnd-final-inner {
          position: relative;
          z-index: 2;
          padding: 110px 20px 120px;
          text-align: center;
        }
        .mlnd-final-tag {
          margin: 0 0 18px;
          font-size: 10px;
          letter-spacing: 2px;
          opacity: 0.95;
        }
        .mlnd-final-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 1.7rem;
          font-weight: 700;
          letter-spacing: -0.8px;
          color: #fff;
          margin: 0 0 16px;
          line-height: 1.12;
        }
        .mlnd-final-accent { color: var(--signature); }
        .mlnd-final-body {
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          max-width: 32ch;
          margin: 0 auto 28px;
          line-height: 1.6;
        }
        .mlnd-final-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px;
          border-radius: 12px;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(240,184,208,0.3);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: mlndPillBreathe 3.6s ease-in-out infinite;
        }
        @keyframes mlndPillBreathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(240,184,208,0.18); border-color: rgba(240,184,208,0.28); }
          50%      { box-shadow: 0 0 28px 4px rgba(240,184,208,0.22); border-color: rgba(240,184,208,0.45); }
        }
        .mlnd-final-pill-glyph {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          color: var(--signature);
          line-height: 1;
        }
        .mlnd-final-pill-text {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.88);
          letter-spacing: 0.3px;
        }

        /* ─────────── Footer ─────────── */
        .mlnd-foot {
          background: var(--bg-deep);
          border-top: 1px solid rgba(var(--signature-rgb), 0.08);
          padding: 32px 20px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .mlnd-foot-brand { color: var(--signature); display: inline-flex; }
        .mlnd-foot-line {
          margin: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-faint);
          letter-spacing: 0.4px;
        }

        @media (prefers-reduced-motion: reduce) {
          .mlnd-term-cursor,
          .mlnd-timeline-rail::after,
          .mlnd-step-dot,
          .mlnd-final-pill { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
