'use client';

import BlurText from '@/components/landing/BlurText';
import { MONO, PINK } from '@/components/landing/constants';
import DemoShell from './DemoShell';

export default function DemoSection() {
  return (
    <section
      id="demo"
      className="section-pad"
      style={{ position: 'relative', background: '#030303', padding: '120px 40px', overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(240,184,208,0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'left', marginBottom: 40 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              color: PINK,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              marginBottom: 16,
              opacity: 0.8,
            }}
          >
            $ recgon --demo --no-auth
          </div>
          <BlurText
            text="The whole product. No account needed."
            animateBy="words"
            delay={80}
            stepDuration={0.4}
            style={{ fontFamily: MONO, fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}
          />
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.45)',
              maxWidth: 560,
              margin: '14px 0 0',
              fontFamily: MONO,
            }}
          >
            Six tabs. Two projects. Real mock data.{' '}
            <span style={{ color: PINK, opacity: 0.8 }}>Click anything</span>
            {' '}— this is exactly what you get on day one, minus the credentials.
          </p>
        </div>

        <DemoShell />
      </div>
    </section>
  );
}
