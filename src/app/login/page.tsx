'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import RecgonLogo from '@/components/RecgonLogo';

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    title: 'Codebase Analysis',
    desc: 'Point to any repo or local path — get a full product breakdown in seconds.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
    title: 'Marketing Content',
    desc: 'Generate copy and images for Instagram, TikTok, and Google Ads.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    title: 'Feedback Intelligence',
    desc: 'Paste comments or scrape Instagram — get sentiment, themes, and dev prompts.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
      </svg>
    ),
    title: 'Everything in Minutes',
    desc: 'What used to take a team days now runs in a single session, start to finish.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('Invalid email or password');
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10rem' }}>

      {/* Login form */}
      <div style={{ width: '340px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>Welcome back</h1>
        <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem' }}>Sign in to continue</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '0.7rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)', border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '0.25rem' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--btn-secondary-border)' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--btn-secondary-border)' }} />
        </div>
        <button
          type="button"
          onClick={() => signIn('github', { callbackUrl: '/' })}
          style={{ width: '100%', padding: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', marginTop: '0.75rem' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--txt-muted)', marginBottom: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: 'var(--txt-pure)', fontWeight: 500, textDecoration: 'none' }}>Create one</Link>
        </p>
      </div>

      {/* Feature panel */}
      <div style={{ width: '360px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3.5rem' }}>
          <RecgonLogo size={28} uid="logo-login" />
          <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--signature)', letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Recgon</span>
        </div>

        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--txt-pure)', lineHeight: 1.2, margin: '0 0 0.75rem', letterSpacing: '-0.5px' }}>
          The coach solo<br />founders don't have
        </h2>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.95rem', margin: '0 0 3rem', lineHeight: 1.6 }}>
          Part mentor, part cofounder — Recgon knows your product, tells you the truth, and keeps you moving.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(var(--signature-rgb), 0.07)', border: '1px solid rgba(var(--signature-rgb), 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--signature)' }}>
                {f.icon}
              </div>
              <div>
                <p style={{ margin: '0 0 0.2rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--txt-pure)' }}>{f.title}</p>
                <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--txt-muted)', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      </div>
    </div>
  );
}
