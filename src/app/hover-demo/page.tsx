'use client';

import { useState } from 'react';

const CardContent = () => (
  <>
    <div style={{ fontSize: 13, color: 'var(--txt-muted)', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" }}>// project</div>
    <div style={{ fontWeight: 600 }}>my-saas-app</div>
    <div style={{ fontSize: 12, color: 'var(--txt-faint)', marginTop: 4 }}>Analyzed · 3 campaigns</div>
  </>
);

// Each alternative stores base + hover styles; we apply hover via JS state on each card
const combinedAlt = {
  id: 'GA',
  label: 'G + A — Your pick',
  description: 'Scale pulse (G) with outer pink halo (A)',
  base: {
    transition: 'box-shadow 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1)',
  },
  hover: {
    transform: 'scale(1.015) translateZ(0)',
    boxShadow: '0 0 0 1px rgba(232,168,196,0.4), 0 0 32px 4px rgba(232,168,196,0.18)',
  },
};

const glassAlternatives = [
  {
    id: 'A',
    label: 'A — Outer glow',
    description: 'Soft pink halo radiates out, no movement',
    base: {
      transition: 'box-shadow 0.3s cubic-bezier(0.16,1,0.3,1)',
    },
    hover: {
      boxShadow: '0 0 0 1px rgba(232,168,196,0.4), 0 0 32px 4px rgba(232,168,196,0.18)',
    },
  },
  {
    id: 'B',
    label: 'B — Lift + glow ring',
    description: 'Floats up with a tight pink outline ring',
    base: {
      transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s cubic-bezier(0.16,1,0.3,1)',
    },
    hover: {
      transform: 'translateY(-4px) translateZ(0)',
      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.15), 0 0 0 2px rgba(232,168,196,0.45)',
    },
  },
  {
    id: 'C',
    label: 'C — Pink wash',
    description: 'Background tints pink, border brightens',
    base: {
      transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
    },
    hover: {
      background: 'rgba(232,168,196,0.07)',
      borderColor: 'rgba(232,168,196,0.5)',
      boxShadow: '0 0 0 3px rgba(232,168,196,0.1)',
    },
  },
  {
    id: 'D',
    label: 'D — Left accent bar',
    description: 'A solid pink bar slides in on the left edge',
    base: {
      transition: 'box-shadow 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1)',
    },
    hover: {
      transform: 'translateY(-2px) translateZ(0)',
      boxShadow: 'inset 3px 0 0 rgba(232,168,196,0.8), 0 12px 32px -8px rgba(0,0,0,0.12)',
    },
  },
  {
    id: 'E',
    label: 'E — Top shimmer bar',
    description: 'Thin pink line appears on the top edge',
    base: {
      transition: 'box-shadow 0.25s cubic-bezier(0.16,1,0.3,1), transform 0.25s cubic-bezier(0.16,1,0.3,1)',
    },
    hover: {
      transform: 'translateY(-2px) translateZ(0)',
      boxShadow: 'inset 0 3px 0 rgba(232,168,196,0.8), 0 12px 32px -8px rgba(0,0,0,0.12)',
    },
  },
  {
    id: 'F',
    label: 'F — Gradient border',
    description: 'Pink gradient border intensifies on hover',
    base: {
      transition: 'background 0.3s, box-shadow 0.3s, transform 0.3s cubic-bezier(0.16,1,0.3,1)',
      background: 'var(--bg-content) padding-box, linear-gradient(135deg, rgba(232,168,196,0.35) 0%, rgba(255,255,255,0.06) 50%, rgba(232,168,196,0.15) 100%) border-box',
    },
    hover: {
      transform: 'translateY(-2px) translateZ(0)',
      background: 'var(--glass-hover) padding-box, linear-gradient(135deg, rgba(232,168,196,0.8) 0%, rgba(255,255,255,0.1) 50%, rgba(232,168,196,0.6) 100%) border-box',
      boxShadow: '0 16px 40px -8px rgba(0,0,0,0.12)',
    },
  },
  {
    id: 'G',
    label: 'G — Scale pulse',
    description: 'Subtle scale-up with pink border bloom',
    base: {
      transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s',
    },
    hover: {
      transform: 'scale(1.015) translateZ(0)',
      boxShadow: '0 0 0 1.5px rgba(232,168,196,0.5), 0 16px 32px -8px rgba(232,168,196,0.15)',
    },
  },
];

const otherEffects = [
  {
    id: 'nav-link',
    label: 'Nav link',
    description: 'Pink tint + outline ring',
    preview: (
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="nav-link"
        style={{ borderRadius: 999, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}
      >
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        Dashboard
      </a>
    ),
  },
  {
    id: 'btn-secondary',
    label: 'Secondary button',
    description: 'Pink wash + border + outer glow',
    preview: <button className="btn btn-secondary">Analyze project</button>,
  },
  {
    id: 'btn-primary',
    label: 'Primary button',
    description: 'Lift + shadow',
    preview: <button className="btn btn-primary">Generate</button>,
  },
  {
    id: 'tag',
    label: 'Tag / badge',
    description: 'Pink fill + pink text + border',
    preview: (
      <div className="tags-row">
        {['B2B SaaS', 'Solo founder', 'Early stage'].map((t) => (
          <span key={t} className="tag" style={{ cursor: 'default' }}>{t}</span>
        ))}
      </div>
    ),
  },
  {
    id: 'chat-suggestion',
    label: 'Chat suggestion',
    description: 'Pink wash + slight left indent',
    preview: (
      <div style={{ width: '100%' }}>
        {['What am I not thinking about?', 'How do I find my first 100 users?'].map((s) => (
          <button key={s} className="chat-suggestion" onClick={(e) => e.preventDefault()}>
            <span className="chat-suggestion-prefix">›</span>
            {s}
          </button>
        ))}
      </div>
    ),
  },
  {
    id: 'form-input',
    label: 'Form input',
    description: 'Pink border on hover, pink glow on focus',
    preview: <input className="form-input" placeholder="e.g. https://github.com/user/repo" style={{ width: '100%' }} />,
  },
  {
    id: 'dev-prompt',
    label: 'Dev prompt card',
    description: 'Pink wash + pink left accent bar',
    preview: (
      <div className="dev-prompt" style={{ cursor: 'default' }}>
        <div className="dev-prompt-label">// task</div>
        <div className="dev-prompt-text">Add a waitlist page that collects emails.</div>
      </div>
    ),
  },
  {
    id: 'platform-option',
    label: 'Platform option',
    description: 'Pink tint + border + ring',
    preview: (
      <div className="platform-selector">
        {[['📸', 'Instagram'], ['🎵', 'TikTok'], ['🔍', 'Google']].map(([icon, name]) => (
          <div key={name} className="platform-option">
            <div className="platform-option-icon">{icon}</div>
            <div className="platform-option-label">{name}</div>
          </div>
        ))}
      </div>
    ),
  },
];

function GlassAltCard({ alt }: { alt: typeof glassAlternatives[number] }) {
  const [hovered, setHovered] = useState(false);
  const style = {
    padding: 24,
    cursor: 'default',
    ...(hovered ? { ...alt.base, ...alt.hover } : alt.base),
  };
  return (
    <div
      className="glass-card"
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CardContent />
    </div>
  );
}

function PreviewBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 16,
      padding: 24,
      background: 'var(--btn-secondary-bg)',
      borderRadius: 12,
      border: '1px dashed var(--btn-secondary-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
    }}>
      {children}
    </div>
  );
}

export default function HoverDemoPage() {
  return (
    <div className="content-wrapper" style={{ paddingTop: 0 }}>
      <div className="page-header">
        <h2>// hover effects demo</h2>
        <p>Hover over each element to preview the effect.</p>
      </div>

      {/* Glass card alternatives */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: 'var(--signature)', textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.8 }}>
          // glass card — pick one
        </span>
      </div>
      {/* Combined preview — full width, prominent */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: 'var(--signature)' }}>{combinedAlt.label}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
          {combinedAlt.description}
        </div>
        <div style={{ maxWidth: 320 }}>
          <GlassAltCard alt={combinedAlt} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--btn-secondary-border)', marginBottom: 32 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 56 }}>
        {glassAlternatives.map((alt) => (
          <div key={alt.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>{alt.label}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
              {alt.description}
            </div>
            <GlassAltCard alt={alt} />
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--btn-secondary-border)', marginBottom: 48 }} />

      {/* Other confirmed effects */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: 'var(--signature)', textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.8 }}>
          // other elements — already confirmed
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {otherEffects.map((effect) => (
          <div key={effect.id} className="glass-card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>{effect.label}</span>
              <span style={{ fontSize: 11, color: 'var(--txt-faint)', fontFamily: "'JetBrains Mono', monospace" }}>— {effect.description}</span>
            </div>
            <PreviewBox>{effect.preview}</PreviewBox>
          </div>
        ))}
      </div>
    </div>
  );
}
