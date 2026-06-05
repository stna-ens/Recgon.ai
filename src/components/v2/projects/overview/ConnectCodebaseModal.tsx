'use client';

import { useTranslations } from 'next-intl';

interface ConnectCodebaseModalProps {
  open: boolean;
  path: string;
  onPathChange: (s: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function ConnectCodebaseModal({
  open,
  path,
  onPathChange,
  onClose,
  onSubmit,
  loading,
}: ConnectCodebaseModalProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  if (!open) return null;
  return (
    <div className="v2-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="glass-card is-static v2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v2-modal-head">
          <span className="recgon-label v2-block-eye">{t('connectCodebase.eyebrow')}</span>
          <button type="button" className="v2-modal-x" onClick={onClose} aria-label={tCommon('close')}>×</button>
        </div>
        <p className="v2-modal-hint">
          {t('connectCodebase.hint')}
        </p>
        <label className="v2-field">
          <span className="v2-field-label">{t('connectCodebase.urlLabel')}</span>
          <input
            type="text"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder={t('connectCodebase.urlPlaceholder')}
            className="v2-input"
            autoFocus
          />
        </label>
        <div className="v2-modal-actions">
          <div className="v2-modal-spacer" />
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onClose}>{tCommon('cancel')}</button>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={onSubmit}
            disabled={loading || !path.trim()}
          >
            {loading ? <><span className="v2-mod-spinner" /> {t('connectCodebase.connecting')}</> : t('connectCodebase.connectAnalyze')}
          </button>
        </div>
      </div>
    </div>
  );
}
