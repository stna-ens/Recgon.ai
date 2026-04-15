'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import RecgonLogo from '@/components/RecgonLogo';
import DecryptedText from '@/components/landing/DecryptedText';
import { AUDIENCE, MONO, PINK, features, steps } from '@/components/landing/constants';

const Aurora = dynamic(() => import('@/components/landing/Aurora'), { ssr: false });

const MATRIX_CHARS = '01{}[]()<>/\\|+-=*#@$%&!?.,:;';

type MatrixColumn = {
  left: string;
  width: string;
  duration: string;
  delay: string;
  opacity: number;
  text: string;
};

function MatrixRain() {
  const [columns, setColumns] = useState<MatrixColumn[]>([]);

  useEffect(() => {
    const cols = 26;
    const arr: MatrixColumn[] = Array.from({ length: cols }, (_, i) => {
      const len = 14 + Math.floor(Math.random() * 16);
      let text = '';
      for (let j = 0; j < len; j++) {
        text += MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)] + '\n';
      }
      return {
        left: `${((i + 0.5) * (100 / cols)).toFixed(2)}%`,
        width: `${(100 / cols).toFixed(2)}%`,
        duration: `${(5 + Math.random() * 5).toFixed(2)}s`,
        delay: `${(-Math.random() * 6).toFixed(2)}s`,
        opacity: Number((0.35 + Math.random() * 0.55).toFixed(2)),
        text,
      };
    });
    setColumns(arr);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {columns.map((col, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: 0,
            left: col.left,
            width: col.width,
            transform: 'translateX(-50%)',
            textAlign: 'center',
            fontFamily: MONO,
            fontSize: '11px',
            fontWeight: 500,
            lineHeight: 1.25,
            color: PINK,
            opacity: col.opacity,
            whiteSpace: 'pre',
            textShadow: '0 0 6px rgba(240,184,208,0.55)',
            animation: `mlMatrixFall ${col.duration} linear ${col.delay} infinite`,
            willChange: 'transform',
          }}
        >
          {col.text}
        </div>
      ))}
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
      speed={40}
      maxIterations={12}
      className="pink-decrypted-char"
      encryptedClassName="pink-encrypted-char"
    />
  );
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 },
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
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function MobileLanding() {
  const [heroDone, setHeroDone] = useState(false);
  const [audIndex, setAudIndex] = useState(0);
  const [audKey, setAudKey] = useState(0);
  const [audStarted, setAudStarted] = useState(false);

  useEffect(() => {
    if (!heroDone) return;
    const interval = setInterval(() => {
      setAudStarted(true);
      setAudIndex((i) => (i + 1) % AUDIENCE.length);
      setAudKey((k) => k + 1);
    }, 2800);
    return () => clearInterval(interval);
  }, [heroDone]);

  return (
    <div style={{ background: '#000', color: '#fff', overflowX: 'hidden', WebkitTapHighlightColor: 'rgba(240,184,208,0.2)' }}>
      <style>{`
        @keyframes mlFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes mlBlink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        @keyframes mlMatrixFall {
          0%   { transform: translate(-50%, -100%); }
          100% { transform: translate(-50%, 100dvh); }
        }
        .ml-encrypted-char { color: rgba(240,184,208,0.55); }
        .ml-decrypted-char  { color: #ffffff; }
        .pink-encrypted-char { color: rgba(240,184,208,0.35); }
        .pink-decrypted-char { color: #f0b8d0; }
        .ml-btn { touch-action: manipulation; transition: transform 0.15s ease, background 0.25s ease, border-color 0.25s ease; }
        .ml-btn:active { transform: scale(0.98); }
        @media (prefers-reduced-motion: reduce) {
          .ml-no-motion { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#000' }}>
          <MatrixRain />
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.92) 82%)',
          }}
        />

        {/* Status bar */}
        <header
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 18px 0',
          }}
        >
          <span style={{ color: PINK, display: 'flex', alignItems: 'center' }}>
            <RecgonLogo size={22} uid="ml-logo-header" />
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: 'rgba(240,184,208,0.7)',
            }}
          >
            // v0.1
          </span>
        </header>

        {/* Spacer to push content toward bottom */}
        <div style={{ flex: 1 }} />

        {/* Hero content — bottom-anchored */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '0 18px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: '1.6px',
              marginBottom: '18px',
              opacity: 0.85,
            }}
          >
            {heroDone ? (
              <>// for <RotatingWord word={AUDIENCE[audIndex]} decryptKey={audKey} started={audStarted} /></>
            ) : (
              '// for solo founders'
            )}
          </div>

          <h1
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(1.9rem, 9vw, 2.6rem)',
              fontWeight: 700,
              letterSpacing: '-1.2px',
              lineHeight: 1.08,
              margin: '0 0 18px',
              color: '#fff',
            }}
          >
            {!heroDone ? (
              <DecryptedText
                text="The Coach Solo Founders Don't Have"
                animateOn="view"
                sequential
                speed={40}
                maxIterations={12}
                className="ml-decrypted-char"
                encryptedClassName="ml-encrypted-char"
                onComplete={() => setHeroDone(true)}
              />
            ) : (
              <>
                The Coach{' '}
                <span style={{ color: PINK }}>
                  <RotatingWord word={AUDIENCE[audIndex]} decryptKey={audKey} started={audStarted} />
                </span>{' '}
                Don&apos;t Have
              </>
            )}
          </h1>

          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.6)',
              margin: '0 0 26px',
              maxWidth: '34ch',
            }}
          >
            Analyze your code. Generate marketing. Turn feedback into developer prompts.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 18px',
              borderRadius: '14px',
              background: 'rgba(240,184,208,0.06)',
              border: '1px solid rgba(240,184,208,0.22)',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: '18px',
                color: PINK,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {'>_'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: PINK,
                  textTransform: 'uppercase',
                  letterSpacing: '1.4px',
                  marginBottom: '3px',
                }}
              >
                // desktop only — for now
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255,255,255,0.55)',
                  lineHeight: 1.5,
                }}
              >
                Sign up from your laptop. Mobile app is coming soon.
              </div>
            </div>
          </div>
          <a
            href="#ml-features"
            className="ml-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '52px',
              borderRadius: '14px',
              fontFamily: MONO,
              fontSize: '14px',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
              textDecoration: 'none',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            See what you&apos;ll get ↓
          </a>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section
        id="ml-features"
        style={{
          position: 'relative',
          background: '#000',
          padding: '84px 18px 72px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(rgba(240,184,208,0.11) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 70% at 50% 40%, black 30%, transparent 100%)',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 40%, black 30%, transparent 100%)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                fontWeight: 700,
                color: PINK,
                textTransform: 'uppercase',
                letterSpacing: '1.6px',
                marginBottom: '14px',
              }}
            >
              // capabilities · 06
            </div>
            <h2
              style={{
                fontFamily: MONO,
                fontSize: '1.55rem',
                fontWeight: 700,
                letterSpacing: '-0.6px',
                lineHeight: 1.15,
                color: '#fff',
                margin: '0 0 36px',
              }}
            >
              Everything you need,
              <br />
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>nothing you don&apos;t.</span>
            </h2>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 70}>
                <div
                  style={{
                    position: 'relative',
                    padding: '20px 20px 20px 22px',
                    borderRadius: '14px',
                    background:
                      'linear-gradient(135deg, rgba(240,184,208,0.05) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 100%)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderLeft: '2px solid rgba(240,184,208,0.45)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: '11px',
                        fontWeight: 700,
                        color: PINK,
                        letterSpacing: '1px',
                        opacity: 0.75,
                      }}
                    >
                      [{String(i + 1).padStart(2, '0')}]
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: '20px', color: PINK, opacity: 0.9 }}>
                      {feature.icon}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontFamily: MONO,
                      fontSize: '15px',
                      fontWeight: 700,
                      letterSpacing: '-0.2px',
                      color: '#fff',
                      margin: '0 0 6px',
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: 'rgba(255,255,255,0.5)',
                      margin: 0,
                    }}
                  >
                    {feature.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works (timeline) ──────────────────────────────────────── */}
      <section style={{ background: '#050505', padding: '84px 18px 72px' }}>
        <Reveal>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: '1.6px',
              marginBottom: '14px',
            }}
          >
            // workflow
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: '1.55rem',
              fontWeight: 700,
              letterSpacing: '-0.6px',
              lineHeight: 1.15,
              color: '#fff',
              margin: '0 0 40px',
            }}
          >
            Three steps.
            <br />
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Zero friction.</span>
          </h2>
        </Reveal>

        <div style={{ position: 'relative', paddingLeft: '38px' }}>
          {/* rail */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: '13px',
              top: '8px',
              bottom: '8px',
              width: '1px',
              background:
                'linear-gradient(to bottom, rgba(240,184,208,0.5) 0%, rgba(240,184,208,0.15) 50%, rgba(240,184,208,0) 100%)',
            }}
          />
          {steps.map((step, i) => (
            <Reveal key={step.number} delay={i * 120}>
              <div style={{ position: 'relative', paddingBottom: i === steps.length - 1 ? 0 : '36px' }}>
                {/* dot */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: '-32px',
                    top: '4px',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#050505',
                    border: `2px solid ${PINK}`,
                    boxShadow: '0 0 0 4px rgba(240,184,208,0.12)',
                  }}
                />
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '11px',
                    fontWeight: 700,
                    color: PINK,
                    letterSpacing: '1.2px',
                    marginBottom: '6px',
                    opacity: 0.8,
                  }}
                >
                  STEP {step.number}
                </div>
                <h3
                  style={{
                    fontFamily: MONO,
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#fff',
                    margin: '0 0 6px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Claude MCP ───────────────────────────────────────────────────── */}
      <section style={{ background: '#000', padding: '84px 18px 72px' }}>
        <Reveal>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: '1.6px',
              marginBottom: '14px',
            }}
          >
            // claude integration
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: '1.55rem',
              fontWeight: 700,
              letterSpacing: '-0.6px',
              lineHeight: 1.15,
              color: '#fff',
              margin: '0 0 16px',
            }}
          >
            Claude&apos;s <span style={{ color: PINK }}>Best Friend</span>
          </h2>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.5)',
              margin: '0 0 28px',
            }}
          >
            Recgon plugs into Claude Code via MCP — Claude reads your analysis, takes action, marks it done.
          </p>
        </Reveal>

        {/* Compact terminal strip */}
        <Reveal delay={80}>
          <div
            style={{
              position: 'relative',
              borderRadius: '14px',
              overflow: 'hidden',
              background: '#0d0d0d',
              border: '1px solid rgba(240,184,208,0.18)',
              boxShadow: '0 30px 60px -30px rgba(240,184,208,0.25)',
            }}
          >
            <div
              style={{
                background: '#161616',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '10px',
                  color: 'rgba(255,255,255,0.3)',
                  marginLeft: '10px',
                }}
              >
                claude — recgon-mcp
              </span>
            </div>
            <div
              style={{
                padding: '18px 18px 20px',
                fontFamily: MONO,
                fontSize: '11.5px',
                lineHeight: 1.85,
              }}
            >
              <div>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>$ </span>
                <span style={{ color: PINK }}>list_projects</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>()</span>
              </div>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>$ </span>
                <span style={{ color: PINK }}>get_project_analysis</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>(</span>
                <span style={{ color: '#98c379' }}>&quot;my-saas&quot;</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>)</span>
              </div>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>$ </span>
                <span style={{ color: PINK }}>get_actionable_items</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>(</span>
                <span style={{ color: '#98c379' }}>&quot;my-saas&quot;</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>)</span>
              </div>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>$ </span>
                <span style={{ color: PINK }}>mark_item_complete</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>({'{ ... }'})</span>
              </div>
              <div style={{ height: '8px' }} />
              <div style={{ color: '#28c840' }}>✓ tracked in Recgon</div>
              <div style={{ marginTop: '2px' }}>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>$ </span>
                <span
                  className="ml-no-motion"
                  style={{
                    display: 'inline-block',
                    width: '7px',
                    height: '12px',
                    background: 'rgba(255,255,255,0.5)',
                    verticalAlign: 'middle',
                    animation: 'mlBlink 1s steps(1) infinite',
                  }}
                />
              </div>
            </div>
          </div>
        </Reveal>

        <div
          style={{
            marginTop: '20px',
            fontFamily: MONO,
            fontSize: '11px',
            color: 'rgba(255,255,255,0.28)',
            textAlign: 'center',
          }}
        >
          // You stay in control. Claude asks before it acts.
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="ml-faq" style={{ background: '#050505', padding: '84px 18px 72px' }}>
        <Reveal>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '10px',
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: '1.6px',
              marginBottom: '14px',
            }}
          >
            // faq
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: '1.55rem',
              fontWeight: 700,
              letterSpacing: '-0.6px',
              lineHeight: 1.15,
              color: '#fff',
              margin: '0 0 36px',
            }}
          >
            Common questions
          </h2>
        </Reveal>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            {
              q: 'What is Recgon?',
              a: 'An AI platform for solo founders and indie hackers. It analyzes your codebase, generates marketing content, plans campaigns, turns user feedback into dev prompts, and mentors you through growth.',
            },
            {
              q: 'How does codebase analysis work?',
              a: "Point Recgon at a local directory or GitHub URL. AI walks your code, extracts your product's purpose, stack, and features, and builds a full profile in seconds.",
            },
            {
              q: 'What marketing content can it generate?',
              a: 'Platform-ready copy for Instagram, TikTok, and Google Ads — grounded in your actual product. Also creates campaign timelines and content calendars.',
            },
            {
              q: 'Does it integrate with Claude Code?',
              a: 'Yes. Via MCP, Claude can read your analysis, pick up prioritized next steps, implement them, and mark them done — all tracked in Recgon.',
            },
            {
              q: 'Is Recgon free?',
              a: 'Yes, free to get started. Sign up from your laptop to begin analyzing your product.',
            },
          ].map(({ q, a }, i) => (
            <Reveal key={q} delay={i * 60}>
              <div
                style={{
                  padding: '18px 18px 18px 20px',
                  borderRadius: '14px',
                  background:
                    'linear-gradient(135deg, rgba(240,184,208,0.05) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: '2px solid rgba(240,184,208,0.35)',
                }}
              >
                <h3
                  style={{
                    fontFamily: MONO,
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#fff',
                    margin: '0 0 8px',
                    letterSpacing: '-0.1px',
                  }}
                >
                  {q}
                </h3>
                <p style={{ fontSize: '13px', lineHeight: 1.65, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  {a}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <Aurora colorStops={['#1a0a10', '#f0b8d0', '#1a0a10']} amplitude={0.7} blend={0.4} speed={0.5} />
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '110px 20px 120px',
            textAlign: 'center',
          }}
        >
          <Reveal>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '10px',
                fontWeight: 700,
                color: PINK,
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '18px',
              }}
            >
              // desktop only
            </div>
            <h2
              style={{
                fontFamily: MONO,
                fontSize: '1.7rem',
                fontWeight: 700,
                letterSpacing: '-0.8px',
                color: '#fff',
                margin: '0 0 16px',
                lineHeight: 1.12,
              }}
            >
              Built for your
              <br />
              <span style={{ color: PINK }}>laptop.</span>
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.6)',
                maxWidth: '32ch',
                margin: '0 auto 28px',
                lineHeight: 1.6,
              }}
            >
              Recgon&apos;s a tool you use while you build. Open it on your laptop to sign up — mobile is on the way.
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 22px',
                borderRadius: '12px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(240,184,208,0.3)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '14px',
                  color: PINK,
                  lineHeight: 1,
                }}
              >
                {'$'}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.88)',
                  letterSpacing: '0.3px',
                }}
              >
                open recgon.app on desktop
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer
        style={{
          background: '#000',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '32px 20px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
        }}
      >
        <span style={{ color: PINK, display: 'flex' }}>
          <RecgonLogo size={22} uid="ml-logo-footer" />
        </span>
        <p
          style={{
            fontFamily: MONO,
            fontSize: '11px',
            color: 'rgba(255,255,255,0.3)',
            margin: 0,
            letterSpacing: '0.4px',
          }}
        >
          recgon — built for builders
        </p>
      </footer>
    </div>
  );
}
