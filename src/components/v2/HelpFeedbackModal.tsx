'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';

type Category = 'bug' | 'idea' | 'question' | 'other';

const CATEGORY_VALUES: Category[] = ['bug', 'idea', 'question', 'other'];

const MAX_LEN = 4000;

export default function HelpFeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const t = useTranslations('shared');
  const [mounted, setMounted] = useState(false);
  const [category, setCategory] = useState<Category>('idea');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCategory('idea');
      setMessage('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open || !mounted || typeof document === 'undefined') return null;

  const trimmed = message.trim();
  const canSubmit = trimmed.length >= 3 && trimmed.length <= MAX_LEN && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/help-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: trimmed,
          pageUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || t('helpFeedback.requestFailed', { status: res.status }));
      }
      addToast(t('helpFeedback.received'), 'success');
      onClose();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('helpFeedback.sendError'), 'error');
      setSubmitting(false);
    }
  };

  const CATEGORY_LABEL: Record<Category, string> = {
    bug: t('helpFeedback.catBugLabel'),
    idea: t('helpFeedback.catIdeaLabel'),
    question: t('helpFeedback.catQuestionLabel'),
    other: t('helpFeedback.catOtherLabel'),
  };
  const CATEGORY_HINT: Record<Category, string> = {
    bug: t('helpFeedback.catBugHint'),
    idea: t('helpFeedback.catIdeaHint'),
    question: t('helpFeedback.catQuestionHint'),
    other: t('helpFeedback.catOtherHint'),
  };

  return createPortal(
    <div className="v2-hf-overlay" role="dialog" aria-modal="true" aria-labelledby="v2-hf-title">
      <div className="v2-hf-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="v2-hf-card">
        <div className="v2-hf-head">
          <div>
            <div id="v2-hf-title" className="v2-hf-title">{t('helpFeedback.title')}</div>
            <div className="v2-hf-sub">{t('helpFeedback.subtitle')}</div>
          </div>
          <button type="button" className="v2-hf-close" onClick={onClose} aria-label={t('helpFeedback.close')}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="v2-hf-section">
          <div className="v2-hf-label">{t('helpFeedback.typeLabel')}</div>
          <div className="v2-hf-cats">
            {CATEGORY_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={`v2-hf-cat${category === value ? ' v2-hf-cat-active' : ''}`}
                onClick={() => setCategory(value)}
                aria-pressed={category === value}
              >
                <span className="v2-hf-cat-label">{CATEGORY_LABEL[value]}</span>
                <span className="v2-hf-cat-hint">{CATEGORY_HINT[value]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="v2-hf-section">
          <div className="v2-hf-label-row">
            <span className="v2-hf-label">{t('helpFeedback.messageLabel')}</span>
            <span className="v2-hf-counter">{trimmed.length}/{MAX_LEN}</span>
          </div>
          <textarea
            className="v2-hf-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              category === 'bug'
                ? t('helpFeedback.placeholderBug')
                : category === 'idea'
                ? t('helpFeedback.placeholderIdea')
                : category === 'question'
                ? t('helpFeedback.placeholderQuestion')
                : t('helpFeedback.placeholderOther')
            }
            maxLength={MAX_LEN}
            autoFocus
          />
        </div>

        <div className="v2-hf-foot">
          <button type="button" className="v2-hf-btn v2-hf-btn-ghost" onClick={onClose}>
            {t('helpFeedback.cancel')}
          </button>
          <button
            type="button"
            className="v2-hf-btn v2-hf-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? t('helpFeedback.sending') : t('helpFeedback.send')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes v2-hf-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes v2-hf-card-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        .v2-hf-overlay {
          position: fixed; inset: 0; z-index: 1100;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .v2-hf-backdrop {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          animation: v2-hf-backdrop-in 160ms ease-out both;
        }
        .v2-hf-card {
          position: relative;
          width: 100%;
          max-width: 520px;
          padding: 18px 18px 16px;
          background: color-mix(in oklab, var(--bg-deep, #0a0a0c) 96%, transparent);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(20px) saturate(150%);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.10));
          border-radius: 12px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.2);
          color: var(--txt-pure);
          animation: v2-hf-card-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
          transform-origin: center top;
        }
        @media (prefers-reduced-motion: reduce) {
          .v2-hf-backdrop,
          .v2-hf-card { animation: none; }
        }
        .v2-hf-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .v2-hf-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.01em;
        }
        .v2-hf-sub {
          margin-top: 2px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.2px;
        }
        .v2-hf-close {
          width: 26px; height: 26px;
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent;
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          border-radius: 6px;
          color: var(--txt-muted);
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .v2-hf-close:hover {
          background: rgba(var(--signature-rgb), 0.06);
          color: var(--txt-pure);
          border-color: rgba(var(--signature-rgb), 0.45);
        }

        .v2-hf-section { margin-bottom: 12px; }
        .v2-hf-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .v2-hf-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .v2-hf-counter {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
        }

        .v2-hf-cats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 6px;
        }
        .v2-hf-cat {
          display: flex; flex-direction: column; gap: 2px;
          align-items: flex-start;
          padding: 8px 10px;
          background: transparent;
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          border-radius: 8px;
          color: var(--txt-muted);
          cursor: pointer;
          text-align: left;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        .v2-hf-cat:hover {
          background: rgba(var(--signature-rgb), 0.05);
          color: var(--txt-pure);
        }
        .v2-hf-cat-active {
          background: rgba(var(--signature-rgb), 0.10);
          border-color: rgba(var(--signature-rgb), 0.55);
          color: var(--txt-pure);
        }
        .v2-hf-cat-label {
          font-size: 12px;
          font-weight: 600;
        }
        .v2-hf-cat-hint {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
        }

        .v2-hf-textarea {
          width: 100%;
          min-height: 140px;
          max-height: 320px;
          padding: 10px 12px;
          background: rgba(0,0,0,0.18);
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          border-radius: 8px;
          color: var(--txt-pure);
          font-family: inherit;
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
          outline: none;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .v2-hf-textarea::placeholder { color: var(--txt-faint); }
        .v2-hf-textarea:focus {
          border-color: rgba(var(--signature-rgb), 0.55);
          background: rgba(0,0,0,0.24);
        }

        .v2-hf-foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }
        .v2-hf-btn {
          padding: 7px 14px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: background 120ms ease, color 120ms ease, border-color 120ms ease, opacity 120ms ease;
        }
        .v2-hf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .v2-hf-btn-ghost {
          background: transparent;
          border: 1px solid var(--btn-secondary-border, rgba(255,255,255,0.08));
          color: var(--txt-muted);
        }
        .v2-hf-btn-ghost:hover:not(:disabled) {
          background: rgba(255,255,255,0.04);
          color: var(--txt-pure);
        }
        .v2-hf-btn-primary {
          background: var(--signature);
          border: 1px solid var(--signature);
          color: #fff;
        }
        .v2-hf-btn-primary:hover:not(:disabled) {
          filter: brightness(1.06);
        }

        @media (max-width: 520px) {
          .v2-hf-cats { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>,
    document.body
  );
}
