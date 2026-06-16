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

function LoginPageContent() {
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
      title: t('login.features.analysis.title'),
      desc: t('login.features.analysis.desc'),
    },
    {
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      title: t('login.features.marketing.title'),
      desc: t('login.features.marketing.desc'),
    },
    {
      icon: (
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      title: t('login.features.speed.title'),
      desc: t('login.features.speed.desc'),
    },
  ];

  const URL_ERRORS: Record<string, string> = {
    metuonly: t('login.errors.metuOnly'),
    waitlisted: t('login.errors.waitlisted'),
    CredentialsSignin: t('login.errors.invalidCredentials'),
    credentials: t('login.errors.invalidCredentials'),
    Configuration: t('login.errors.configuration'),
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState(URL_ERRORS[searchParams.get('error') ?? ''] ?? '');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const notice = searchParams.get('reset') === '1'
    ? t('login.notices.passwordReset')
    : searchParams.get('registered') === '1'
      ? t('login.notices.registered')
      : '';

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function validateEmail(): string {
    if (!email.trim()) return t('validation.emailRequired');
    if (!EMAIL_RE.test(email.trim())) return t('validation.emailInvalid');
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const eErr = validateEmail();
    const pErr = password ? '' : t('validation.passwordRequired');
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr) { emailRef.current?.focus(); return; }
    if (pErr) { passwordRef.current?.focus(); return; }

    setLoading(true);
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      setLoading(false);
      // Detect error in either the result object OR the returned URL.
      // next-auth v5 beta sometimes still puts the error in `url` even when
      // redirect:false is set; treating both as auth failure is the only
      // reliable way to surface the message in-place.
      const urlError = result?.url ? new URL(result.url, window.location.origin).searchParams.get('error') : null;
      if (result?.error || urlError) {
        const code = result?.error ?? urlError ?? '';
        setError(URL_ERRORS[code] ?? t('login.errors.invalidCredentials'));
        emailRef.current?.focus();
        return;
      }
      const raw = searchParams.get('callbackUrl') ?? '';
      // Only honor relative paths to prevent open redirects.
      const dest = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
      router.push(dest);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : t('login.errors.signInFailed'));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">

      {/* Login form */}
      <div className="auth-col">
        <h1 className="auth-title">{t('login.title')}</h1>
        <p className="auth-sub">{t('login.subtitle')}</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          {notice && !error && (
            <div role="status" className="auth-notice">
              {notice}
            </div>
          )}
          <FormField label={t('login.emailLabel')} htmlFor="login-email" error={emailError || undefined} required>
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
          <FormField label={t('login.passwordLabel')} htmlFor="login-password" error={passwordError || undefined} required>
            <PasswordInput
              ref={passwordRef}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(''); }}
              placeholder={t('placeholders.password')}
            />
          </FormField>
          {error && (
            <div role="alert" className="auth-alert">
              {error}
            </div>
          )}
          <p className="auth-forgot">
            <Link href="/forgot-password" className="auth-foot-link">{t('login.forgotPassword')}</Link>
          </p>
          <Button type="submit" variant="primary" loading={loading} className="auth-submit">
            {loading ? t('login.signingIn') : t('login.signIn')}
          </Button>
        </form>

        <div className="auth-divider">
          <span className="auth-divider-line" />
          <span className="auth-divider-text">{t('login.or')}</span>
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
            const raw = searchParams.get('callbackUrl') ?? '';
            const dest = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
            signIn('github', { callbackUrl: dest });
          }}
        >
          {oauthLoading && <span className="auth-oauth-spinner" aria-hidden="true" />}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.293 0 .321.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          {t('login.continueWithGithub')}
        </button>

        <p className="auth-foot">
          {t('login.noAccount')}{' '}
          <Link
            href={(() => {
              const raw = searchParams.get('callbackUrl') ?? '';
              const dest = raw.startsWith('/') && !raw.startsWith('//') ? raw : '';
              return dest ? `/register?callbackUrl=${encodeURIComponent(dest)}` : '/register';
            })()}
            className="auth-foot-link"
          >{t('login.createOne')}</Link>
        </p>
      </div>

      {/* Feature panel */}
      <div className="auth-feature">
        <div className="auth-brand">
          <RecgonLogo size={28} uid="logo-login" />
          <span className="auth-brand-name">Recgon</span>
        </div>

        <h2 className="auth-hero">
          {t.rich('login.heroHeadline', { br: () => <br /> })}
        </h2>
        <p className="auth-hero-sub">
          {t('login.heroSub')}
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
      <style>{authStyles}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', minHeight: '100vh' }} />}>
      <LoginPageContent />
    </Suspense>
  );
}
