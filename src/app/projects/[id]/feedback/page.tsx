'use client';

import dynamic from 'next/dynamic';
import DecryptedText from '@/components/landing/DecryptedText';
import SpotlightCard from '@/components/landing/SpotlightCard';
import { MONO, PINK } from '@/components/landing/constants';

const Aurora = dynamic(() => import('@/components/landing/Aurora'), { ssr: false });

export default function V2ProjectFeedbackPage() {
  return (
    <div className="wip-stage">
      <div className="wip-aurora">
        <Aurora colorStops={['#1a0a10', '#f0b8d0', '#1a0a10']} amplitude={0.9} blend={0.4} speed={0.45} />
      </div>

      <div className="wip-vignette" />

      <div className="wip-content">
        <SpotlightCard
          spotlightColor="rgba(240,184,208,0.18)"
          style={{
            maxWidth: 620,
            width: '100%',
            padding: '48px 44px',
            background: 'rgba(10, 8, 12, 0.55)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          }}
        >
          <div
            className="wip-fade"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: '1.2px',
              marginBottom: 28,
              opacity: 0.9,
              animationDelay: '0ms',
            }}
          >
            // feedback_engine
          </div>

          <h1
            className="wip-title"
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(1.9rem, 3.4vw, 2.6rem)',
              fontWeight: 700,
              letterSpacing: '-1px',
              lineHeight: 1.15,
              margin: '0 0 28px',
              color: '#fff',
            }}
          >
            <DecryptedText
              text="Work in progress"
              animateOn="view"
              sequential
              speed={45}
              maxIterations={14}
              className="decrypted-char"
              encryptedClassName="encrypted-char"
            />
          </h1>

          <p
            className="wip-fade"
            style={{
              fontSize: 15.5,
              lineHeight: 1.7,
              color: 'rgba(255,255,255,0.78)',
              margin: '0 0 18px',
              animationDelay: '700ms',
            }}
          >
            Recgon is being rebuilt to pull real user feedback from public sources &mdash; Reddit,
            Hacker News, App Store, GitHub Issues &mdash; so your AI product manager hears from your
            users without you copying anything in.
          </p>

          <p
            className="wip-fade"
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.5)',
              margin: '0 0 32px',
              animationDelay: '900ms',
            }}
          >
            Until that lands, this tab is paused. The analysis pipeline &mdash; themes, bugs, dev
            prompts &mdash; is intact and will resurface once collection is honest.
          </p>

          <div
            className="wip-fade"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'rgba(240,184,208,0.08)',
              border: '1px solid rgba(240,184,208,0.28)',
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.6px',
              color: PINK,
              textTransform: 'uppercase',
              animationDelay: '1100ms',
            }}
          >
            <span className="wip-dot" />
            <span>building · v0</span>
          </div>
        </SpotlightCard>
      </div>

      <style>{`
        .wip-stage {
          position: relative;
          min-height: calc(100vh - 200px);
          width: 100%;
          overflow: hidden;
          isolation: isolate;
        }
        .wip-aurora {
          position: absolute;
          inset: 0;
          opacity: 0.55;
          z-index: 0;
          pointer-events: none;
        }
        .wip-vignette {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background:
            radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 75%),
            linear-gradient(180deg, rgba(10,8,12,0.4) 0%, rgba(10,8,12,0.1) 50%, rgba(10,8,12,0.6) 100%);
        }
        .wip-content {
          position: relative;
          z-index: 2;
          min-height: calc(100vh - 200px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
        }
        .wip-fade {
          opacity: 0;
          transform: translateY(6px);
          animation: wip-fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes wip-fade-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .wip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${PINK};
          box-shadow: 0 0 10px rgba(240,184,208,0.85);
          animation: wip-pulse 1.8s ease-in-out infinite;
        }
        @keyframes wip-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
