import type { Campaign, CampaignType, Platform } from './types';

// `id` maps to the LLM-facing campaign type (unchanged). `labelKey` /
// `descKey` index into the `marketing.campaignTypes` namespace so the visible
// label + description are localized at render time.
export const CAMPAIGN_TYPES: Array<{
  id: CampaignType;
  labelKey: string;
  descKey: string;
}> = [
  { id: 'product-launch', labelKey: 'campaignTypes.productLaunch.label', descKey: 'campaignTypes.productLaunch.description' },
  { id: 'brand-awareness', labelKey: 'campaignTypes.brandAwareness.label', descKey: 'campaignTypes.brandAwareness.description' },
  { id: 'lead-generation', labelKey: 'campaignTypes.leadGeneration.label', descKey: 'campaignTypes.leadGeneration.description' },
  { id: 'community-growth', labelKey: 'campaignTypes.communityGrowth.label', descKey: 'campaignTypes.communityGrowth.description' },
  { id: 're-engagement', labelKey: 'campaignTypes.reEngagement.label', descKey: 'campaignTypes.reEngagement.description' },
  { id: 'content-marketing', labelKey: 'campaignTypes.contentMarketing.label', descKey: 'campaignTypes.contentMarketing.description' },
];

// `value` is the LLM-facing duration string (unchanged). `labelKey` indexes
// into `marketing.durations` for the localized pill label.
export const DURATIONS = [
  { value: '2 weeks', labelKey: 'durations.twoWeeks' },
  { value: '1 month', labelKey: 'durations.oneMonth' },
  { value: '3 months', labelKey: 'durations.threeMonths' },
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

// Localization-friendly hero descriptor. Instead of returning baked English
// strings, buildMarketingHero now returns a discriminated `state` plus the
// data each state needs; MarketingHeader resolves it through useTranslations.
export type MarketingHeroState =
  | { state: 'planning' }
  | { state: 'active'; campaignName: string; typeId: string; duration: string; count: number }
  | { state: 'hasCampaigns'; count: number; typeId: CampaignType | null; duration: string }
  | { state: 'first' };

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
}): MarketingHeroState {
  if (isPlanning) return { state: 'planning' };
  if (activeCampaign) {
    return {
      state: 'active',
      campaignName: activeCampaign.plan.campaignName,
      typeId: activeCampaign.type,
      duration: activeCampaign.duration,
      count: activeCampaign.plan.contentCalendar.length,
    };
  }
  if (campaigns.length > 0) {
    return { state: 'hasCampaigns', count: campaigns.length, typeId: campaignType, duration };
  }
  return { state: 'first' };
}
