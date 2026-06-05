'use client';

import { useTranslations } from 'next-intl';
import MarketingPreview from '@/components/MarketingPreview';
import type { GeneratedContentEntry } from './types';

interface Props {
  entry: GeneratedContentEntry;
  onClose: () => void;
}

export default function MarketingPreviewModal({ entry, onClose }: Props) {
  const t = useTranslations('marketing');
  return (
    <div className="v2-m-preview-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="v2-m-preview-shell" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v2-m-preview-close" onClick={onClose}>
          {t('preview.close')}
        </button>
        <MarketingPreview platform={entry.platform} content={entry.content} />
      </div>
    </div>
  );
}
