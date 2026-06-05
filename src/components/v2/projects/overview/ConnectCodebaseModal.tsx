'use client';

import { useTranslations } from 'next-intl';
import { Modal, Button } from '@/components/ui';

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
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('connectCodebase.eyebrow')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            loading={loading}
            disabled={!path.trim()}
          >
            {loading ? t('connectCodebase.connecting') : t('connectCodebase.connectAnalyze')}
          </Button>
        </>
      }
    >
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
    </Modal>
  );
}
