'use client';

import { useState } from 'react';
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
    desc: 'Generate copy for Instagram, TikTok, and Google Ads — grounded in what your product actually does.',
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
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <path d="M14 17h7M17.5 14v7"/>
      </svg>
    ),
    title: "Claude's Best Friend",
    desc: "Connect Recgon to Claude Code via MCP. Claude reads your analysis and implements next steps — with your approval.",
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Something went wrong');
    } else {
      router.push('/login?registered=1');
    }
  }

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10rem' }}>

        {/* Register form */}
        <div style={{ width: '340px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>Create account</h1>
          <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem' }}>Get started with Recgon</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nickname</label>
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="How should we call you?" required minLength={2} style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ padding: '0.7rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)', border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '0.25rem' }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--txt-muted)', marginBottom: 0 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--txt-pure)', fontWeight: 500, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>

        {/* Feature panel */}
        <div style={{ width: '360px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3.5rem' }}>
            <RecgonLogo size={28} uid="logo-register" />
            <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--signature)', letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Recgon</span>
          </div>

          <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--txt-pure)', lineHeight: 1.2, margin: '0 0 0.75rem', letterSpacing: '-0.5px' }}>
            The coach solo<br />founders don&apos;t have
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
