'use client';

import type { Campaign } from './types';
import { CAMPAIGN_TYPES } from './utils';

interface Props {
  hero: { lead: string; sub?: string };
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
  const ct = activeCampaign
    ? CAMPAIGN_TYPES.find((t) => t.id === activeCampaign.type) ?? null
    : null;

  return (
    <header className="v2-m-head">
      <div>
        <span className="recgon-label v2-m-eye">› marketing</span>
        <h2 className="v2-m-hero">
          <span>{hero.lead}</span>
          {isPlanning && <span className="v2-m-spinner" aria-hidden="true" />}
        </h2>
        <p className="v2-m-sub">
          {ct && <span className="v2-m-chip">{ct.label.toLowerCase()}</span>}
          {activeCampaign && <span className="v2-m-chip">{activeCampaign.duration}</span>}
          {hero.sub && <span>{hero.sub}</span>}
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
            aria-label="Switch active campaign"
          >
            <option value="" disabled>
              {campaigns.length === 1 ? '1 campaign' : `${campaigns.length} campaigns`}
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
            title="Start a new campaign"
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
            new
          </button>
        </div>
      )}
    </header>
  );
}
