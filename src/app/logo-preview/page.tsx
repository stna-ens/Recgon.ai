'use client';

const EYE = "M1 12 C5 6, 19 6, 23 12 C19 18, 5 18, 1 12 Z";
const BG = "var(--bg-deep, #0a0a0a)";

// Explore small tweaks to the S-curve — all clipped to the eye
const logos = [
  {
    id: 1,
    name: 'S — Original',
    desc: 'The one you liked, now clipped properly',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M4 10 C8 6, 16 18, 20 14" stroke={BG} strokeWidth={3} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
  {
    id: 2,
    name: 'S — Thinner',
    desc: 'Lighter cut — more subtle, elegant',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M4 10 C8 6, 16 18, 20 14" stroke={BG} strokeWidth={2} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
  {
    id: 3,
    name: 'S — Thicker',
    desc: 'Heavier cut — more dramatic split',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M4 10 C8 6, 16 18, 20 14" stroke={BG} strokeWidth={4.5} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
  {
    id: 4,
    name: 'S — Steeper',
    desc: 'More pronounced S, tighter curves',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M4 11 C7 5, 17 19, 20 13" stroke={BG} strokeWidth={3} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
  {
    id: 5,
    name: 'S — Centered',
    desc: 'Curve passes through the exact center',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M3 12 C7 7, 17 17, 21 12" stroke={BG} strokeWidth={3} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
  {
    id: 6,
    name: 'S — Reversed',
    desc: 'S flipped — tension goes the other way',
    svg: (uid: string) => (
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <defs><clipPath id={uid}><path d={EYE}/></clipPath></defs>
        <path d={EYE} fill="currentColor" stroke="none"/>
        <path d="M4 14 C8 18, 16 6, 20 10" stroke={BG} strokeWidth={3} fill="none" clipPath={`url(#${uid})`}/>
      </svg>
    ),
  },
];

export default function LogoPreviewPage() {
  return (
    <div style={{ padding: '64px 48px', maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 8, fontSize: 32, fontWeight: 700, letterSpacing: '-1px' }}>S-Curve Eye — Refined</h2>
      <p style={{ color: 'var(--txt-muted)', marginBottom: 56, fontSize: 16 }}>All clipped to the eye boundary. Tell me the number.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {logos.map((logo) => (
          <div key={logo.id} className="glass-card" style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
              <div style={{ width: 120, height: 120, color: 'var(--txt-pure)' }}>
                {logo.svg(`logo-lg-${logo.id}`)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 28 }}>
              <div style={{ width: 22, height: 22, color: 'var(--txt-pure)', opacity: 0.55 }}>
                {logo.svg(`logo-sm-${logo.id}`)}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.55 }}>Recgon</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt-pure)', marginBottom: 5 }}>#{logo.id}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{logo.name}</div>
            <div style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.65 }}>{logo.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
