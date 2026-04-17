import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Recgon — The Coach Solo Founders Don\'t Have';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ).then((r) => r.text());
    const match = css.match(/src:\s*url\((https:\/\/[^)]+\.(?:woff2?|ttf))\)/);
    if (!match) return null;
    return fetch(match[1]).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [inter400, inter600, inter700, mono500] = await Promise.all([
    loadFont('Inter', 400),
    loadFont('Inter', 600),
    loadFont('Inter', 700),
    loadFont('JetBrains+Mono', 500),
  ]);

  const SIGNATURE = '#f0b8d0';
  const BG = '#000000';
  const TXT_PURE = '#ffffff';
  const TXT_MUTED = '#8e8e93';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: BG,
          position: 'relative',
          fontFamily: 'Inter',
        }}
      >
        {/* Subtle iOS pink aura — top right */}
        <div
          style={{
            position: 'absolute',
            top: -280,
            right: -280,
            width: 900,
            height: 900,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(240,184,208,0.18) 0%, rgba(240,184,208,0) 60%)',
            display: 'flex',
          }}
        />
        {/* Subtle iOS blue aura — bottom left */}
        <div
          style={{
            position: 'absolute',
            bottom: -300,
            left: -200,
            width: 800,
            height: 800,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(0,122,255,0.12) 0%, rgba(0,122,255,0) 65%)',
            display: 'flex',
          }}
        />

        {/* Brand mark — top left, subtle */}
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24">
            <path
              d="M1 12 C5 6, 19 6, 23 12 C19 18, 5 18, 1 12 Z"
              fill={SIGNATURE}
            />
            <path
              d="M4 8.5 C8 4.5, 16 16.5, 20 12.5 L20 15.5 C16 19.5, 8 7.5, 4 11.5 Z"
              fill={BG}
            />
          </svg>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: TXT_PURE,
              letterSpacing: '-0.02em',
            }}
          >
            Recgon
          </div>
        </div>

        {/* Glass card — centered */}
        <div
          style={{
            position: 'absolute',
            top: 140,
            left: 64,
            right: 64,
            bottom: 64,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 72px',
            background: 'rgba(20, 20, 22, 0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 32,
            boxShadow:
              'inset 0 1px 1px rgba(255,255,255,0.15), 0 24px 48px -12px rgba(0,0,0,0.6)',
          }}
        >
          {/* // RECGON mono label */}
          <div
            style={{
              fontFamily: 'JetBrainsMono',
              fontSize: 14,
              fontWeight: 500,
              color: SIGNATURE,
              letterSpacing: '0.12em',
              marginBottom: 28,
              opacity: 0.85,
              display: 'flex',
            }}
          >
            // THE COACH SOLO FOUNDERS DON'T HAVE
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              color: TXT_PURE,
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              maxWidth: 960,
              marginBottom: 32,
            }}
          >
            Analyze. Ship. Grow.
          </div>

          {/* Subhead */}
          <div
            style={{
              fontSize: 26,
              fontWeight: 400,
              color: TXT_MUTED,
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
              maxWidth: 880,
            }}
          >
            AI-powered product strategy, marketing, feedback analysis, and
            mentorship — in one place.
          </div>

          {/* Bottom row: feature chips */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 48,
            }}
          >
            {['Codebase', 'Marketing', 'Feedback', 'Analytics'].map((label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  padding: '10px 18px',
                  background: 'rgba(240,184,208,0.06)',
                  border: '1px solid rgba(240,184,208,0.22)',
                  borderRadius: 999,
                  color: SIGNATURE,
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* URL bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 38,
            right: 80,
            fontFamily: 'JetBrainsMono',
            fontSize: 15,
            color: TXT_MUTED,
            letterSpacing: '0.02em',
            display: 'flex',
          }}
        >
          recgon.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        inter400 && { name: 'Inter', data: inter400, weight: 400 as const, style: 'normal' as const },
        inter600 && { name: 'Inter', data: inter600, weight: 600 as const, style: 'normal' as const },
        inter700 && { name: 'Inter', data: inter700, weight: 700 as const, style: 'normal' as const },
        mono500 && { name: 'JetBrainsMono', data: mono500, weight: 500 as const, style: 'normal' as const },
      ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 600 | 700 | 500; style: 'normal' }[],
    }
  );
}
