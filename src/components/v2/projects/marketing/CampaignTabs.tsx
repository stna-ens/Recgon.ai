'use client';

import { useTranslations } from 'next-intl';
import type { Tab } from './types';

interface Props {
  active: Tab;
  onChange: (t: Tab) => void;
}

const TABS: Array<{ id: Tab; labelKey: string }> = [
  { id: 'overview', labelKey: 'tabs.overview' },
  { id: 'channels', labelKey: 'tabs.channels' },
  { id: 'calendar', labelKey: 'tabs.calendar' },
  { id: 'metrics', labelKey: 'tabs.metrics' },
];

export default function CampaignTabs({ active, onChange }: Props) {
  const t = useTranslations('marketing');
  return (
    <nav className="v2-m-tabs" aria-label={t('tabs.sectionsAria')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`v2-m-tab ${active === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </nav>
  );
}
