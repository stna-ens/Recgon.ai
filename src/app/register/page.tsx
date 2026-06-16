'use client';

import { Suspense, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import RecgonLogo from '@/components/RecgonLogo';
import { Button, FormField, PasswordInput } from '@/components/ui';
import { authStyles } from '@/components/auth/authStyles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const NICKNAME_MIN = 2;

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

  // Field-level validation errors
  const [nicknameError, setNicknameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  // OTP step
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [waitlistMessage, setWaitlistMessage] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const nicknameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function validateNickname(): string {
    if (nickname.trim().length < NICKNAME_MIN) return t('validation.nicknameMin', { min: NICKNAME_MIN });
    return '';
  }
  function validateEmail(): string {
    if (!email.trim()) return t('validation.emailRequired');
    if (!EMAIL_RE.test(email.trim())) return t('validation.emailInvalid');
    return '';
  }
  function validatePassword(): string {
    if (password.length < PASSWORD_MIN) return t('validation.passwordMin', { min: PASSWORD_MIN });
    return '';
  }
  function validateConfirm(): string {
    if (confirm !== password) return t('register.errors.passwordMismatch');
    return '';
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const nErr = validateNickname();
    const eErr = validateEmail();
    const pErr = validatePassword();
    const cErr = validateConfirm();
    setNicknameError(nErr);
    setEmailError(eErr);
    setPasswordError(pErr);
    setConfirmError(cErr);
    if (nErr) { nicknameRef.current?.focus(); return; }
    if (eErr) { emailRef.current?.focus(); return; }
    if (pErr) { passwordRef.current?.focus(); return; }
    if (cErr) { confirmRef.current?.focus(); return; }

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
    <div className="auth-page">
      <div className="auth-wrap">

        {/* Left panel: form or verify step */}
        <div className="auth-col">
          {step === 'form' ? (
            <>
              <h1 className="auth-title">{t('register.title')}</h1>
              <p className="auth-sub" style={{ marginBottom: '0.5rem' }}>{t('register.subtitle')}</p>
              <p className="auth-sub" style={{ fontSize: '0.8rem', lineHeight: 1.55 }}>
                {t('register.waitlistNote')}
              </p>

              <form onSubmit={handleFormSubmit} className="auth-form" noValidate>
                <FormField label={t('register.nicknameLabel')} htmlFor="reg-nickname" error={nicknameError || undefined} required>
                  <input
                    ref={nicknameRef}
                    className="ui-input"
                    type="text"
                    autoComplete="nickname"
                    autoFocus
                    value={nickname}
                    onChange={(e) => { setNickname(e.target.value); if (nicknameError) setNicknameError(''); }}
                    onBlur={() => setNicknameError(validateNickname())}
                    placeholder={t('register.nicknamePlaceholder')}
                  />
                </FormField>
                <FormField label={t('register.emailLabel')} htmlFor="reg-email" error={emailError || undefined} required>
                  <input
                    ref={emailRef}
                    className="ui-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                    onBlur={() => setEmailError(validateEmail())}
                    placeholder={t('placeholders.email')}
                  />
                </FormField>
                <FormField label={t('register.passwordLabel')} htmlFor="reg-password" error={passwordError || undefined} required>
                  <PasswordInput
                    ref={passwordRef}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                    onBlur={() => setPasswordError(validatePassword())}
                    placeholder={t('register.passwordPlaceholder')}
                  />
                </FormField>
                <FormField label={t('register.confirmPasswordLabel')} htmlFor="reg-confirm" error={confirmError || undefined} required>
                  <PasswordInput
                    ref={confirmRef}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); if (confirmError) setConfirmError(''); }}
                    onBlur={() => setConfirmError(validateConfirm())}
                    placeholder={t('placeholders.password')}
                  />
                </FormField>
                {error && <div role="alert" className="auth-alert">{error}</div>}
                <Button type="submit" variant="primary" loading={loading} className="auth-submit">
                  {loading ? t('register.sendingCode') : t('register.continue')}
                </Button>
              </form>

              <div className="auth-divider">
                <span className="auth-divider-line" />
                <span className="auth-divider-text">{t('register.or')}</span>
                <span className="auth-divider-line" />
              </div>
              <button
                type="button"
                className="auth-oauth"
                disabled={oauthLoading}
                aria-busy={oauthLoading}
                onClick={() => {
                  if (oauthLoading) return;
                  setOauthLoading(true);
                  signIn('github', { callbackUrl: callbackUrl || '/' });
                }}
              >
                {oauthLoading && <span className="auth-oauth-spinner" aria-hidden="true" />}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                {t('register.continueWithGithub')}
              </button>

              <p className="auth-foot">
                {t('register.haveAccount')}{' '}
                <Link href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'} className="auth-foot-link">{t('register.signIn')}</Link>
              </p>
            </>
          ) : step === 'verify' ? (
            <>
              <button
                type="button"
                className="auth-back"
                onClick={() => { setStep('form'); setError(''); setOtp(''); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('register.back')}
              </button>

              <h1 className="auth-title">{t('register.verify.title')}</h1>
              <p className="auth-sub" style={{ lineHeight: 1.5 }}>
                {t.rich('register.verify.sentTo', { email, strong: (chunks) => <strong style={{ color: 'var(--txt-pure)' }}>{chunks}</strong> })}
              </p>

              <form onSubmit={handleVerifySubmit} className="auth-form" noValidate>
                <FormField label={t('register.verify.codeLabel')} htmlFor="reg-otp" required>
                  <input
                    className="ui-input auth-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('placeholders.otp')}
                    autoFocus
                  />
                </FormField>
                {error && <div role="alert" className="auth-alert">{error}</div>}
                <Button type="submit" variant="primary" loading={loading} disabled={otp.length !== 6} className="auth-submit">
                  {loading ? t('register.verify.creatingAccount') : t('register.verify.createAccount')}
                </Button>
              </form>

              <p className="auth-foot">
                {t('register.verify.didntReceive')}{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="auth-link-btn"
                  style={{ color: resendCooldown > 0 ? 'var(--txt-muted)' : 'var(--txt-pure)', cursor: resendCooldown > 0 ? 'default' : 'pointer' }}
                >
                  {resendCooldown > 0 ? t('register.verify.resendIn', { seconds: resendCooldown }) : t('register.verify.resendCode')}
                </button>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className="auth-back"
                onClick={() => { setStep('form'); setError(''); setWaitlistMessage(''); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('register.back')}
              </button>

              <h1 className="auth-title">{t('register.waitlist.title')}</h1>
              <p className="auth-sub" style={{ lineHeight: 1.6, marginBottom: '1.25rem' }}>
                {waitlistMessage}
              </p>
              <div className="auth-waitlist-card">
                <p className="auth-waitlist-email">
                  {email}
                </p>
                <p className="auth-waitlist-note">
                  {t('register.waitlist.onceApproved')}
                </p>
              </div>
              <Button
                type="button"
                variant="primary"
                className="auth-submit"
                onClick={() => { setStep('form'); setWaitlistMessage(''); }}
              >
                {t('register.waitlist.useDifferentEmail')}
              </Button>
            </>
          )}
        </div>

        {/* Feature panel */}
        <div className="auth-feature">
          <div className="auth-brand">
            <RecgonLogo size={28} uid="logo-register" />
            <span className="auth-brand-name">Recgon</span>
          </div>

          <h2 className="auth-hero">
            {t.rich('register.heroHeadline', { br: () => <br /> })}
          </h2>
          <p className="auth-hero-sub">
            {t('register.heroSub')}
          </p>

          <div className="auth-feature-list">
            {FEATURES.map((f) => (
              <div key={f.title} className="auth-feature-row">
                <div className="auth-feature-icon">
                  {f.icon}
                </div>
                <div>
                  <p className="auth-feature-title">{f.title}</p>
                  <p className="auth-feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      <style>{authStyles + registerExtraStyles}</style>
    </div>
  );
}

const registerExtraStyles = `
  .auth-waitlist-card {
    padding: 1rem;
    border-radius: var(--r-sm);
    border: 1px solid var(--btn-secondary-border);
    background: var(--btn-secondary-bg);
    margin-bottom: 1.25rem;
  }
  .auth-waitlist-email {
    margin: 0 0 0.45rem;
    color: var(--txt-pure);
    font-size: 0.88rem;
    font-weight: 600;
  }
  .auth-waitlist-note {
    margin: 0;
    color: var(--txt-muted);
    font-size: 0.8rem;
    line-height: 1.55;
  }
`;

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', minHeight: '100vh' }} />}>
      <RegisterPageContent />
    </Suspense>
  );
}
