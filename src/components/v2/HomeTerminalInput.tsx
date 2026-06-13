'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Props {
  visible: boolean;
}

export default function HomeTerminalInput({ visible }: Props) {
  const t = useTranslations('home');
  const router = useRouter();
  const [value, setValue] = useState('');

  if (!visible) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (q) {
      try {
        sessionStorage.setItem('terminal:prefill', q);
      } catch {}
    }
    router.push('/terminal');
  };

  return (
    <section className="v2-ask">
      <span className="recgon-label v2-section-eyebrow">{t('terminal.eyebrow')}</span>

      <form onSubmit={submit} className="glass-card is-static v2-ask-form">
        <span className="v2-ask-prefix" aria-hidden="true">{'>'}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('terminal.placeholder')}
          className="v2-ask-input"
          aria-label={t('terminal.ariaLabel')}
        />
        <button type="submit" className="v2-ask-submit" aria-label={t('terminal.ariaLabel')}>
          <span className="v2-ask-submit-text">{value.trim() ? t('terminal.run') : t('terminal.openTerminal')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </form>

      <style>{`
        .v2-section-eyebrow {
          margin: 0 0 14px;
          color: var(--signature);
        }
        .v2-ask-form {
          display: flex !important;
          align-items: center;
          gap: 14px;
          padding: 14px 16px 14px 22px !important;
        }
        .v2-ask-prefix {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 16px;
          font-weight: 700;
          color: var(--signature);
          line-height: 1;
        }
        .v2-ask-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--txt-pure);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.005em;
          line-height: 1.45;
        }
        .v2-ask-input::placeholder {
          color: var(--txt-faint);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
        }
        .v2-ask-submit {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--signature);
          border: 1px solid var(--signature);
          color: white;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.005em;
          cursor: pointer;
          white-space: nowrap;
          transition: transform var(--dur-base) cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow var(--dur-base) ease;
        }
        .v2-ask-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px -6px rgba(var(--signature-rgb), 0.55);
        }
        .v2-ask-submit:active { transform: translateY(0); }
        .v2-ask-submit svg { transition: transform var(--dur-base) ease; }
        .v2-ask-submit:hover svg { transform: translateX(2px); }

        @media (max-width: 640px) {
          .v2-ask-input { font-size: 13px; }
          .v2-ask-submit-text { display: none; }
        }
      `}</style>
    </section>
  );
}
