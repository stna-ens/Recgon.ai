'use client';

import type { Tab } from './types';

interface Props {
  active: Tab;
  onChange: (t: Tab) => void;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'overview' },
  { id: 'channels', label: 'channels' },
  { id: 'calendar', label: 'content calendar' },
  { id: 'metrics', label: 'metrics & budget' },
];

export default function CampaignTabs({ active, onChange }: Props) {
  return (
    <nav className="v2-m-tabs" aria-label="Campaign sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`v2-m-tab ${active === t.id ? 'is-active' : ''}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? 'page' : undefined}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
