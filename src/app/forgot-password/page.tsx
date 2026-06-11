'use client';

import { Suspense, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import RecgonLogo from '@/components/RecgonLogo';
import { Button, FormField, PasswordInput } from '@/components/ui';
import { authStyles } from '@/app/login/page';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function ForgotPasswordContent() {
  const t = useTranslations('auth');
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'reset'>('email');

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

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
    if (confirm !== password) return t('forgot.errors.passwordMismatch');
    return '';
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

  async function requestCode(): Promise<boolean> {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t('forgot.errors.sendCodeFailed'));
      return false;
    }
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const eErr = validateEmail();
    setEmailError(eErr);
    if (eErr) { emailRef.current?.focus(); return; }

    setLoading(true);
    const ok = await requestCode();
    setLoading(false);
    if (!ok) return;

    setStep('reset');
    startResendCooldown();
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const pErr = validatePassword();
    const cErr = validateConfirm();
    setPasswordError(pErr);
    setConfirmError(cErr);
    if (pErr) { passwordRef.current?.focus(); return; }
    if (cErr) { confirmRef.current?.focus(); return; }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t('forgot.errors.resetFailed'));
      return;
    }

    router.push('/login?reset=1');
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    const ok = await requestCode();
    setLoading(false);
    if (ok) startResendCooldown();
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-col">
          {step === 'email' ? (
            <>
              <h1 className="auth-title">{t('forgot.title')}</h1>
              <p className="auth-sub" style={{ lineHeight: 1.5 }}>{t('forgot.subtitle')}</p>

              <form onSubmit={handleEmailSubmit} className="auth-form" noValidate>
                <FormField label={t('forgot.emailLabel')} htmlFor="forgot-email" error={emailError || undefined} required>
                  <input
                    ref={emailRef}
                    className="ui-input"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                    onBlur={() => setEmailError(validateEmail())}
                    placeholder={t('placeholders.email')}
                  />
                </FormField>
                {error && <div role="alert" className="auth-alert">{error}</div>}
                <Button type="submit" variant="primary" loading={loading} className="auth-submit">
                  {loading ? t('forgot.sendingCode') : t('forgot.sendCode')}
                </Button>
              </form>

              <p className="auth-foot">
                {t('forgot.remembered')}{' '}
                <Link href="/login" className="auth-foot-link">{t('forgot.backToSignIn')}</Link>
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                className="auth-back"
                onClick={() => { setStep('email'); setError(''); setOtp(''); setPassword(''); setConfirm(''); }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                {t('forgot.back')}
              </button>

              <h1 className="auth-title">{t('forgot.reset.title')}</h1>
              <p className="auth-sub" style={{ lineHeight: 1.5 }}>
                {t.rich('forgot.reset.sentTo', { email, strong: (chunks) => <strong style={{ color: 'var(--txt-pure)' }}>{chunks}</strong> })}
              </p>

              <form onSubmit={handleResetSubmit} className="auth-form" noValidate>
                <FormField label={t('forgot.reset.codeLabel')} htmlFor="forgot-otp" required>
                  <input
                    id="forgot-otp"
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
                <FormField label={t('forgot.reset.newPasswordLabel')} htmlFor="forgot-password" error={passwordError || undefined} required>
                  <PasswordInput
                    ref={passwordRef}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                    onBlur={() => setPasswordError(validatePassword())}
                    placeholder={t('placeholders.password')}
                  />
                </FormField>
                <FormField label={t('forgot.reset.confirmPasswordLabel')} htmlFor="forgot-confirm" error={confirmError || undefined} required>
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
                <Button type="submit" variant="primary" loading={loading} disabled={otp.length !== 6} className="auth-submit">
                  {loading ? t('forgot.reset.resetting') : t('forgot.reset.resetPassword')}
                </Button>
              </form>

              <p className="auth-foot">
                {t('forgot.reset.didntReceive')}{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || loading}
                  className="auth-link-btn"
                  style={{ color: resendCooldown > 0 ? 'var(--txt-muted)' : 'var(--txt-pure)', cursor: resendCooldown > 0 ? 'default' : 'pointer' }}
                >
                  {resendCooldown > 0 ? t('forgot.reset.resendIn', { seconds: resendCooldown }) : t('forgot.reset.resendCode')}
                </button>
              </p>
            </>
          )}
        </div>

        <div className="auth-feature">
          <div className="auth-brand">
            <RecgonLogo size={28} uid="logo-forgot" />
            <span className="auth-brand-name">Recgon</span>
          </div>
          <h2 className="auth-hero">{t('forgot.heroHeadline')}</h2>
          <p className="auth-hero-sub">{t('forgot.heroSub')}</p>
        </div>
      </div>
      <style>{authStyles}</style>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
