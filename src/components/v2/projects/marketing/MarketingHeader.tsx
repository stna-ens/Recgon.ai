'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Campaign } from './types';
import { CAMPAIGN_TYPES, type MarketingHeroState } from './utils';

interface Props {
  hero: MarketingHeroState;
  activeCampaign: Campaign | null;
  campaigns: Campaign[];
  isPlanning: boolean;
  onPickCampaign: (campaignId: string) => void;
  onNewCampaign: () => void;
}

// Hero header. Eyebrow + interpretation-led h2 + meta row on the left.
// Campaign switcher (visible when there's at least one past campaign) and
// the "+ new" reset button live to the right and wrap below the hero on
// narrow viewports — same pattern as analytics' control cluster.
export default function MarketingHeader({
  hero,
  activeCampaign,
  campaigns,
  isPlanning,
  onPickCampaign,
  onNewCampaign,
}: Props) {
  const t = useTranslations('marketing');
  const locale = useLocale();

  // Localized, lowercase campaign-type label. Preserves the deliberate
  // lowercase aesthetic with locale-aware casing (Turkish dotless ı etc.).
  const typeLabelLower = (id: string) => {
    const ct = CAMPAIGN_TYPES.find((c) => c.id === id);
    return ct ? t(ct.labelKey).toLocaleLowerCase(locale) : t('hero.campaignFallback');
  };

  // Hero lead + sub resolved from the descriptor state machine.
  let lead: string;
  let sub: string | undefined;
  let chipType: string | null = null;
  let chipDuration: string | null = null;

  switch (hero.state) {
    case 'planning':
      lead = t('hero.draftingLead');
      sub = t('hero.draftingSub');
      break;
    case 'active':
      lead = hero.campaignName;
      sub = t('hero.activeSub', {
        type: typeLabelLower(hero.typeId),
        duration: hero.duration,
        count: hero.count,
      });
      chipType = typeLabelLower(hero.typeId);
      chipDuration = hero.duration;
      break;
    case 'hasCampaigns':
      lead = t('hero.plannedLead', { count: hero.count });
      sub = hero.typeId
        ? t('hero.plannedSubDrafting', { type: typeLabelLower(hero.typeId), duration: hero.duration })
        : t('hero.plannedSubPick');
      break;
    default:
      lead = t('hero.firstLead');
      sub = t('hero.firstSub');
  }

  return (
    <header className="v2-m-head">
      <div>
        <span className="recgon-label v2-m-eye">{t('eyebrow')}</span>
        <h2 className="v2-m-hero">
          <span>{lead}</span>
          {isPlanning && <span className="v2-m-spinner" aria-hidden="true" />}
        </h2>
        <p className="v2-m-sub">
          {chipType && <span className="v2-m-chip">{chipType}</span>}
          {chipDuration && <span className="v2-m-chip">{chipDuration}</span>}
          {sub && <span>{sub}</span>}
        </p>
      </div>

      {campaigns.length > 0 && (
        <div className="v2-m-controls">
          <select
            className="v2-m-switcher"
            value={activeCampaign?.id ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (id) onPickCampaign(id);
            }}
            aria-label={t('header.switcherAria')}
          >
            <option value="" disabled>
              {t('header.switcherCount', { count: campaigns.length })}
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.plan.campaignName} · {c.duration}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="v2-m-new-btn"
            onClick={onNewCampaign}
            title={t('header.newCampaignTitle')}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('header.newCampaign')}
          </button>
        </div>
      )}
    </header>
  );
}
