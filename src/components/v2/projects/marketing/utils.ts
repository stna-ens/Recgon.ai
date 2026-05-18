import type { Campaign, CampaignType, Platform } from './types';

export const CAMPAIGN_TYPES: Array<{
  id: CampaignType;
  label: string;
  description: string;
}> = [
  { id: 'product-launch', label: 'Product Launch', description: 'Announce and drive adoption of a new product or feature' },
  { id: 'brand-awareness', label: 'Brand Awareness', description: 'Build recognition and trust in your target market' },
  { id: 'lead-generation', label: 'Lead Generation', description: 'Capture qualified leads and grow your pipeline' },
  { id: 'community-growth', label: 'Community Growth', description: 'Build and engage a loyal community around your product' },
  { id: 're-engagement', label: 'Re-engagement', description: 'Win back churned users or reactivate dormant leads' },
  { id: 'content-marketing', label: 'Content Marketing', description: 'Establish thought leadership and drive organic growth' },
];

export const DURATIONS = [
  { value: '2 weeks', label: '2 Weeks' },
  { value: '1 month', label: '1 Month' },
  { value: '3 months', label: '3 Months' },
];

export function getPlatformKey(name: string): Platform | null {
  const l = name.toLowerCase();
  if (l.includes('instagram')) return 'instagram';
  if (l.includes('tiktok') || l.includes('tik tok')) return 'tiktok';
  if (l.includes('google')) return 'google-ads';
  return null;
}

export function platformBadgeColor(name: string): string {
  const l = name.toLowerCase();
  if (l.includes('instagram')) return '#e1306c';
  if (l.includes('tiktok')) return '#2d2d2d';
  if (l.includes('google')) return '#4285f4';
  if (l.includes('linkedin')) return '#0a66c2';
  if (l.includes('twitter') || l.includes('x.com')) return '#1da1f2';
  if (l.includes('reddit')) return '#ff4500';
  if (l.includes('email')) return '#6366f1';
  if (l.includes('product hunt')) return '#da552f';
  return '#6b7280';
}

// Hero headline state machine. Mirrors analytics' buildHeroHeadline shape:
// interpretation-led lead text + a soft sub-line. The header surfaces the
// state the user is in without forcing the page to render different titles.
export function buildMarketingHero({
  activeCampaign,
  campaigns,
  isPlanning,
  campaignType,
  duration,
}: {
  activeCampaign: Campaign | null;
  campaigns: Campaign[];
  isPlanning: boolean;
  campaignType: CampaignType | null;
  duration: string;
}): { lead: string; sub?: string } {
  if (isPlanning) {
    return {
      lead: 'drafting your plan…',
      sub: 'recgon is sketching the strategy — this takes ~20s.',
    };
  }
  if (activeCampaign) {
    const ct = CAMPAIGN_TYPES.find((t) => t.id === activeCampaign.type) ?? CAMPAIGN_TYPES[0];
    const count = activeCampaign.plan.contentCalendar.length;
    return {
      lead: activeCampaign.plan.campaignName,
      sub: `${ct.label.toLowerCase()} · ${activeCampaign.duration} · ${count} content items`,
    };
  }
  if (campaigns.length > 0) {
    const typeLabel = campaignType
      ? (CAMPAIGN_TYPES.find((t) => t.id === campaignType)?.label.toLowerCase() ?? 'campaign')
      : 'campaign';
    return {
      lead: `${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'} planned.`,
      sub: campaignType
        ? `drafting a new ${typeLabel} · ${duration}`
        : 'pick one from the switcher or start a new plan.',
    };
  }
  return {
    lead: 'plan your first campaign.',
    sub: 'recgon drafts strategy, channels, calendar — you execute.',
  };
}
