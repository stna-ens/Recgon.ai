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
    desc: 'Generate copy, images, and video for Instagram, TikTok, and Google Ads.',
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

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--txt-muted)', marginBottom: 0 }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: 'var(--txt-pure)', fontWeight: 500, textDecoration: 'none' }}>Create one</Link>
        </p>
      </div>

      {/* Feature panel */}
      <div style={{ width: '360px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3.5rem' }}>
          <RecgonLogo size={28} uid="logo-login" />
          <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--txt-pure)', letterSpacing: '-0.3px' }}>Recgon</span>
        </div>

        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--txt-pure)', lineHeight: 1.2, margin: '0 0 0.75rem', letterSpacing: '-0.5px' }}>
          Your AI product<br />manager
        </h2>
        <p style={{ color: 'var(--txt-muted)', fontSize: '0.95rem', margin: '0 0 3rem', lineHeight: 1.6 }}>
          Analyze code, generate marketing, and turn raw feedback into actionable insights — all in one place.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: '38px', height: '38px', borderRadius: '10px', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-pure)' }}>
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
