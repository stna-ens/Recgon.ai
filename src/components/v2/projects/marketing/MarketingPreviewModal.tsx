'use client';

import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui';
import MarketingPreview from '@/components/MarketingPreview';
import type { GeneratedContentEntry } from './types';

interface Props {
  entry: GeneratedContentEntry;
  onClose: () => void;
}

export default function MarketingPreviewModal({ entry, onClose }: Props) {
  const t = useTranslations('marketing');
  return (
    <Modal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={t('preview.title')}
      size="lg"
    >
      <MarketingPreview platform={entry.platform} content={entry.content} />
    </Modal>
  );
}
