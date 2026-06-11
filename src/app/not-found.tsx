// App-wide 404 — shown for unknown routes and notFound() calls.

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('common.notFoundPage');

  return (
    <div className="nf-page">
      <div className="glass-card nf-card">
        <span className="recgon-label">{t('label')}</span>
        <h1 className="nf-title">{t('title')}</h1>
        <p className="nf-body">{t('body')}</p>
        <Link href="/" className="nf-home">{t('home')} →</Link>
      </div>
      <style>{`
        .nf-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .nf-card {
          width: min(440px, 100%);
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          align-items: flex-start;
        }
        .nf-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--txt-pure);
          letter-spacing: -0.3px;
        }
        .nf-body {
          margin: 0;
          font-size: 0.9rem;
          color: var(--txt-muted);
          line-height: 1.55;
        }
        .nf-home {
          margin-top: 0.75rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--signature);
          text-decoration: none;
        }
        .nf-home:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
