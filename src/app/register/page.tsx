'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import RecgonLogo from '@/components/RecgonLogo';

function RegisterPageContent() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const FEATURES = [
    {
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      title: t('register.features.analysis.title'),
      desc: t('register.features.analysis.desc'),
    },
    {
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      title: t('register.features.marketing.title'),
      desc: t('register.features.marketing.desc'),
    },
    {
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <path d="M14 17h7M17.5 14v7"/>
        </svg>
      ),
      title: t('register.features.claude.title'),
      desc: t('register.features.claude.desc'),
    },
  ];

  // Preserve callbackUrl across registration → login (e.g. team invite links).
  // Only accept relative paths to prevent open redirects.
  const rawCallback = searchParams.get('callbackUrl') ?? '';
  const callbackUrl = rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '';
  const [step, setStep] = useState<'form' | 'verify' | 'waitlist'>('form');

  // Form fields
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // OTP step
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [waitlistMessage, setWaitlistMessage] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(t('register.errors.passwordMismatch'));
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, nickname }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.status === 202 || data.status === 'waitlisted') {
      setWaitlistMessage(
        data.message || t('register.waitlist.defaultMessage'),
      );
      setStep('waitlist');
      return;
    }

    if (!res.ok) {
      setError(data.error || t('register.errors.sendCodeFailed'));
      return;
    }

    setStep('verify');
    startResendCooldown();
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, email, password, otp }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t('register.errors.generic'));
    } else {
      const qs = new URLSearchParams({ registered: '1' });
      if (callbackUrl) qs.set('callbackUrl', callbackUrl);
      router.push(`/login?${qs.toString()}`);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t('register.errors.resendFailed'));
    } else {
      startResendCooldown();
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10rem' }}>

        {/* Left panel: form or verify step */}
        <div style={{ width: '340px' }}>
          {step === 'form' ? (
            <>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>{t('register.title')}</h1>
              <p style={{ color: 'var(--txt-muted)', margin: '0 0 0.5rem', fontSize: '0.875rem' }}>{t('register.subtitle')}</p>
              <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.8rem', lineHeight: 1.55 }}>
                {t('register.waitlistNote')}
              </p>

              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.nicknameLabel')}</label>
                  <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('register.nicknamePlaceholder')} required minLength={2} style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.emailLabel')}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.passwordLabel')}</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('register.passwordPlaceholder')} required minLength={8} style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.confirmPasswordLabel')}</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ padding: '0.7rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)', border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '0.25rem' }}>
                  {loading ? t('register.sendingCode') : t('register.continue')}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--btn-secondary-border)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.or')}</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--btn-secondary-border)' }} />
              </div>
              <button
                type="button"
                onClick={() => signIn('github', { callbackUrl: callbackUrl || '/' })}
                style={{ width: '100%', padding: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', background: 'var(--btn-secondary-bg)', color: 'var(--txt-pure)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', marginTop: '0.75rem' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                {t('register.continueWithGithub')}
              </button>

              <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--txt-muted)', marginBottom: 0 }}>
                {t('register.haveAccount')}{' '}
                <Link href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'} style={{ color: 'var(--txt-pure)', fontWeight: 500, textDecoration: 'none' }}>{t('register.signIn')}</Link>
              </p>
            </>
          ) : step === 'verify' ? (
            <>
              <button
                type="button"
                onClick={() => { setStep('form'); setError(''); setOtp(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--txt-muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('register.back')}
              </button>

              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>{t('register.verify.title')}</h1>
              <p style={{ color: 'var(--txt-muted)', margin: '0 0 2rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {t.rich('register.verify.sentTo', { email, strong: (chunks) => <strong style={{ color: 'var(--txt-pure)' }}>{chunks}</strong> })}
              </p>

              <form onSubmit={handleVerifySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--txt-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('register.verify.codeLabel')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    required
                    autoFocus
                    style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '1.5rem', fontFamily: 'monospace', letterSpacing: '0.4rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
                  />
                </div>
                {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
                <button type="submit" disabled={loading || otp.length !== 6} style={{ padding: '0.7rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)', border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: (loading || otp.length !== 6) ? 'not-allowed' : 'pointer', opacity: (loading || otp.length !== 6) ? 0.7 : 1, marginTop: '0.25rem' }}>
                  {loading ? t('register.verify.creatingAccount') : t('register.verify.createAccount')}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--txt-muted)', marginBottom: 0 }}>
                {t('register.verify.didntReceive')}{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  style={{ background: 'none', border: 'none', color: resendCooldown > 0 ? 'var(--txt-muted)' : 'var(--txt-pure)', fontWeight: 500, fontSize: '0.875rem', cursor: resendCooldown > 0 ? 'default' : 'pointer', padding: 0 }}
                >
                  {resendCooldown > 0 ? t('register.verify.resendIn', { seconds: resendCooldown }) : t('register.verify.resendCode')}
                </button>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep('form'); setError(''); setWaitlistMessage(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--txt-muted)', fontSize: '0.85rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('register.back')}
              </button>

              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--txt-pure)', margin: '0 0 0.3rem', letterSpacing: '-0.3px' }}>{t('register.waitlist.title')}</h1>
              <p style={{ color: 'var(--txt-muted)', margin: '0 0 1.25rem', fontSize: '0.875rem', lineHeight: 1.6 }}>
                {waitlistMessage}
              </p>
              <div style={{
                padding: '1rem',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--btn-secondary-border)',
                background: 'var(--btn-secondary-bg)',
                marginBottom: '1.25rem',
              }}>
                <p style={{ margin: '0 0 0.45rem', color: 'var(--txt-pure)', fontSize: '0.88rem', fontWeight: 600 }}>
                  {email}
                </p>
                <p style={{ margin: 0, color: 'var(--txt-muted)', fontSize: '0.8rem', lineHeight: 1.55 }}>
                  {t('register.waitlist.onceApproved')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setStep('form'); setWaitlistMessage(''); }}
                style={{ padding: '0.7rem', width: '100%', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)', border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}
              >
                {t('register.waitlist.useDifferentEmail')}
              </button>
            </>
          )}
        </div>

        {/* Feature panel */}
        <div style={{ width: '360px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3.5rem' }}>
            <RecgonLogo size={28} uid="logo-register" />
            <span style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--signature)', letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>Recgon</span>
          </div>

          <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--txt-pure)', lineHeight: 1.2, margin: '0 0 0.75rem', letterSpacing: '-0.5px' }}>
            {t.rich('register.heroHeadline', { br: () => <br /> })}
          </h2>
          <p style={{ color: 'var(--txt-muted)', fontSize: '0.95rem', margin: '0 0 3rem', lineHeight: 1.6 }}>
            {t('register.heroSub')}
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

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', minHeight: '100vh' }} />}>
      <RegisterPageContent />
    </Suspense>
  );
}
