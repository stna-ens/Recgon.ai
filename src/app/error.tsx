'use client';

// Route-level error boundary — catches render/data errors in any page and
// shows a recoverable screen instead of a blank viewport.

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common.errorPage');

  useEffect(() => {
    console.error('route error boundary', error);
  }, [error]);

  return (
    <div className="err-page">
      <div className="glass-card err-card">
        <span className="recgon-label">{t('label')}</span>
        <h1 className="err-title">{t('title')}</h1>
        <p className="err-body">{t('body')}</p>
        <div className="err-actions">
          <Button variant="primary" onClick={reset}>{t('retry')}</Button>
          <Link href="/" className="err-home">{t('home')}</Link>
        </div>
        {error.digest && <code className="err-digest">{error.digest}</code>}
      </div>
      <style>{errorStyles}</style>
    </div>
  );
}

const errorStyles = `
  .err-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .err-card {
    width: min(440px, 100%);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .err-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--txt-pure);
    letter-spacing: -0.3px;
  }
  .err-body {
    margin: 0;
    font-size: 0.9rem;
    color: var(--txt-muted);
    line-height: 1.55;
  }
  .err-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .err-home {
    font-size: 0.875rem;
    color: var(--txt-muted);
    text-decoration: none;
  }
  .err-home:hover { color: var(--txt-pure); text-decoration: underline; }
  .err-digest {
    margin-top: 0.5rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.7rem;
    color: var(--txt-muted);
    opacity: 0.6;
  }
`;
