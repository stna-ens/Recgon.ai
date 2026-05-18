export type CampaignType =
  | 'product-launch'
  | 'brand-awareness'
  | 'lead-generation'
  | 'community-growth'
  | 're-engagement'
  | 'content-marketing';

export type Tab = 'overview' | 'channels' | 'calendar' | 'metrics';
export type Platform = 'instagram' | 'tiktok' | 'google-ads';

export interface ContentCalendarItem {
  week: number;
  platform: string;
  contentType: string;
  topic: string;
  angle: string;
  cta: string;
  suggestedFormat: string;
}

export interface CampaignPlan {
  campaignName: string;
  summary: string;
  targetAudience: {
    primary: string;
    secondary: string;
    painPoints: string[];
    motivations: string[];
  };
  keyMessages: string[];
  channels: Array<{
    platform: string;
    strategy: string;
    frequency: string;
    contentTypes: string[];
    estimatedReach: string;
  }>;
  phases: Array<{
    name: string;
    duration: string;
    objective: string;
    tactics: string[];
    keyDeliverables: string[];
  }>;
  contentCalendar: ContentCalendarItem[];
  kpis: Array<{ metric: string; target: string; platform: string; timeframe: string }>;
  budgetGuidance: {
    totalRecommendation: string;
    breakdown: Array<{ channel: string; percentage: number; rationale: string }>;
  };
  quickWins: string[];
}

export interface Campaign {
  id: string;
  type: string;
  goal: string;
  duration: string;
  name: string;
  plan: CampaignPlan;
  createdAt: string;
}

export interface GeneratedContentEntry {
  content: Record<string, string>;
  platform: Platform;
}

export interface MarketingContent extends GeneratedContentEntry {
  id: string;
  generatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  analysis?: { name: string; description: string };
  campaigns?: Campaign[];
  marketingContent?: MarketingContent[];
}
