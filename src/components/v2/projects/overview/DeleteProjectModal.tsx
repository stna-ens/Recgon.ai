'use client';

import { useTranslations } from 'next-intl';

interface DeleteProjectModalProps {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}

export default function DeleteProjectModal({
  open,
  projectName,
  onClose,
  onDelete,
  deleting,
}: DeleteProjectModalProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  if (!open) return null;
  return (
    <div
      className="v2-modal-overlay"
      onClick={() => !deleting && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card is-static v2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v2-modal-head">
          <span className="recgon-label v2-block-eye" style={{ color: 'var(--danger)' }}>{t('deleteModal.eyebrow')}</span>
          <button
            type="button"
            className="v2-modal-x"
            onClick={onClose}
            aria-label={tCommon('close')}
            disabled={deleting}
          >
            ×
          </button>
        </div>
        <p className="v2-modal-hint">
          {t('deleteModal.confirmBefore')}<strong>{projectName}</strong>{t('deleteModal.confirmAfter')}
        </p>
        <div className="v2-modal-actions">
          <div className="v2-modal-spacer" />
          <button
            type="button"
            className="v2-btn v2-btn-ghost"
            onClick={onClose}
            disabled={deleting}
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            className="v2-btn"
            onClick={onDelete}
            disabled={deleting}
            style={{
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
              background: 'rgba(255,69,58,0.06)',
            }}
          >
            {deleting ? <><span className="v2-mod-spinner" /> {t('deleteModal.deleting')}</> : t('deleteModal.deleteProject')}
          </button>
        </div>
      </div>
    </div>
  );
}
