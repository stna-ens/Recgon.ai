'use client';

import { useTranslations } from 'next-intl';
import { Modal, Button } from '@/components/ui';

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
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o && !deleting) onClose();
      }}
      title={t('deleteModal.eyebrow')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            {tCommon('cancel')}
          </Button>
          <Button variant="danger" onClick={onDelete} loading={deleting}>
            {deleting ? t('deleteModal.deleting') : t('deleteModal.deleteProject')}
          </Button>
        </>
      }
    >
      <p className="v2-modal-hint">
        {t('deleteModal.confirmBefore')}<strong>{projectName}</strong>{t('deleteModal.confirmAfter')}
      </p>
    </Modal>
  );
}
