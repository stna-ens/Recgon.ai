import { chat } from './gemini';
import { ProductAnalysis } from './storage';
import { MARKETING_SYSTEM, marketingUserPrompt, CAMPAIGN_SYSTEM, campaignUserPrompt, CampaignType } from './prompts';
import { parseAIResponse, InstagramContentSchema, TikTokContentSchema, GoogleAdsContentSchema, CampaignPlanResponseSchema, CampaignPlanResponse } from './schemas';
import { scrapeWebsite } from './firecrawl';

export type Platform = 'instagram' | 'tiktok' | 'google-ads';
export type { CampaignType };

export interface GeneratedContent {
  platform: Platform;
  content: Record<string, string>;
}

function fallbackMarketingContent(
  analysis: ProductAnalysis,
  platform: Platform,
  customPrompt?: string,
): Record<string, string> {
  const feature = analysis.features[0] ?? analysis.uniqueSellingPoints[0] ?? 'real user value';
  const audience = analysis.targetAudience || 'modern product teams';
  const toneHint = customPrompt ? ` Focus: ${customPrompt}` : '';

  if (platform === 'google-ads') {
    return {
      headline1: `${analysis.name} for ${audience.split(' ')[0] ?? 'teams'}`.slice(0, 30),
      headline2: `${feature}`.slice(0, 30),
      headline3: 'Start free today',
      description1: `${analysis.name} helps ${audience} move faster with ${feature}.`.slice(0, 90),
      description2: `Built for results, not vanity metrics.${toneHint}`.slice(0, 90),
      keywords: `${analysis.name}, ${feature}, ${audience}`,
      negativeKeywords: 'free download, cracked, torrent',
      displayUrl: analysis.name.toLowerCase().replace(/\s+/g, ''),
      callToAction: 'Get Started',
    };
  }

  return {
    caption: `${analysis.name}: ${feature} for ${audience}.${toneHint}`.slice(0, 2200),
    hashtags: `#${analysis.name.replace(/\s+/g, '')} #startup #buildinpublic #product`,
  };
}

function fallbackCampaignPlan(
  analysis: ProductAnalysis,
  campaignType: CampaignType,
  goal: string,
  duration: string,
): CampaignPlanResponse {
  const primaryChannel = analysis.earlyAdopterChannels[0] ?? 'LinkedIn';
  const secondaryChannel = analysis.earlyAdopterChannels[1] ?? 'Twitter/X';
  const keyFeature = analysis.features[0] ?? analysis.uniqueSellingPoints[0] ?? 'clear customer value';

  return {
    campaignName: `${analysis.name} ${campaignType.replace('-', ' ')} plan`,
    summary: `A practical ${duration} plan focused on ${goal} using channels already aligned with your audience.`,
    targetAudience: {
      primary: analysis.targetAudience || 'Early adopters in your niche',
      secondary: 'Adjacent users with similar pain points',
      painPoints: [analysis.problemStatement || 'Current tools are slow or fragmented'],
      motivations: ['Save time', 'Increase consistency', 'Get measurable results faster'],
    },
    keyMessages: [
      `${analysis.name} solves ${analysis.problemStatement || 'a high-friction workflow'}.`,
      `Core value: ${keyFeature}.`,
      'Start small, see value quickly, and scale usage with confidence.',
    ],
    channels: [
      {
        platform: primaryChannel,
        strategy: 'Publish high-signal proof points and problem/solution content.',
        frequency: '3-4 posts per week',
        contentTypes: ['Case study', 'Demo clip', 'How-to post'],
        estimatedReach: '1k-10k/week',
      },
      {
        platform: secondaryChannel,
        strategy: 'Repurpose short insights and launch updates to maintain momentum.',
        frequency: '4-6 posts per week',
        contentTypes: ['Thread', 'Short video', 'Customer quote'],
        estimatedReach: '500-5k/week',
      },
    ],
    phases: [
      {
        name: 'Foundation',
        duration: 'Week 1',
        objective: 'Clarify positioning and content pillars',
        tactics: ['Define 3 message pillars', 'Prepare 2 landing page variants'],
        keyDeliverables: ['Messaging one-pager', 'Baseline analytics dashboard'],
      },
      {
        name: 'Execution',
        duration: 'Week 2-3',
        objective: 'Drive qualified traffic and test hooks',
        tactics: ['Ship 8-12 pieces of content', 'Run low-budget channel experiments'],
        keyDeliverables: ['Weekly performance report', 'Top-performing angles shortlist'],
      },
      {
        name: 'Optimization',
        duration: 'Final week',
        objective: 'Double down on winners',
        tactics: ['Scale best channel and CTA', 'Prune underperforming content types'],
        keyDeliverables: ['Optimized monthly calendar', 'Next-cycle recommendation memo'],
      },
    ],
    contentCalendar: [
      {
        week: 1,
        platform: primaryChannel,
        contentType: 'Educational',
        topic: `${analysis.name} solves ${analysis.problemStatement || 'a real user pain'}`,
        angle: 'Problem first, then practical solution',
        cta: 'Book a demo',
        suggestedFormat: 'Carousel',
      },
      {
        week: 2,
        platform: secondaryChannel,
        contentType: 'Social proof',
        topic: 'Early user outcome and lesson',
        angle: 'Before/after narrative',
        cta: 'Try it free',
        suggestedFormat: 'Short video',
      },
    ],
    kpis: [
      { metric: 'Qualified leads', target: '20-50', platform: primaryChannel, timeframe: duration },
      { metric: 'Landing page conversion rate', target: '3-7%', platform: 'Website', timeframe: duration },
      { metric: 'Content engagement rate', target: '4-8%', platform: secondaryChannel, timeframe: duration },
    ],
    budgetGuidance: {
      totalRecommendation: '$300 - $1,500',
      breakdown: [
        { channel: primaryChannel, percentage: 50, rationale: 'Primary conversion-focused channel' },
        { channel: secondaryChannel, percentage: 30, rationale: 'Awareness and retargeting support' },
        { channel: 'Creative/testing', percentage: 20, rationale: 'Rapid iteration on hooks and creatives' },
      ],
    },
    quickWins: [
      'Pin a concise value proposition post with one clear CTA',
      'Turn best-performing insight into 3 derivative posts',
      'Add a clear social proof block above the fold on the landing page',
    ],
  };
}

export async function generateMarketingContent(
  analysis: ProductAnalysis,
  platform: Platform,
  customPrompt?: string,
  websiteUrl?: string,
): Promise<GeneratedContent> {
  const systemPrompt = MARKETING_SYSTEM[platform];
  if (!systemPrompt) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const websiteContent = websiteUrl ? await scrapeWebsite(websiteUrl) : null;

  const userPrompt = marketingUserPrompt(
    analysis.name,
    analysis.description,
    analysis.techStack,
    analysis.features,
    analysis.targetAudience,
    analysis.uniqueSellingPoints,
    customPrompt,
    websiteContent ?? undefined,
  );

  const schema = (platform === 'instagram'
    ? InstagramContentSchema
    : platform === 'tiktok'
    ? TikTokContentSchema
    : GoogleAdsContentSchema) as import('zod').ZodType<Record<string, string>>;

  const response = await chat(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 8192 });
  let content: Record<string, string>;
  try {
    content = parseAIResponse(response, schema) as Record<string, string>;
  } catch {
    content = fallbackMarketingContent(analysis, platform, customPrompt);
  }
  return {
    platform,
    content,
  };
}

export async function generateCampaignPlan(
  analysis: ProductAnalysis,
  campaignType: CampaignType,
  goal: string,
  duration: string,
  websiteUrl?: string,
): Promise<CampaignPlanResponse> {
  const websiteContent = websiteUrl ? await scrapeWebsite(websiteUrl) : null;

  const userPrompt = campaignUserPrompt(
    analysis.name,
    analysis.description,
    analysis.techStack,
    analysis.features,
    analysis.targetAudience,
    analysis.uniqueSellingPoints,
    analysis.problemStatement,
    analysis.gtmStrategy,
    analysis.earlyAdopterChannels,
    campaignType,
    goal,
    duration,
    websiteContent ?? undefined,
  );

  const response = await chat(CAMPAIGN_SYSTEM, userPrompt, { temperature: 0.8, maxTokens: 16384 });
  try {
    return parseAIResponse(response, CampaignPlanResponseSchema);
  } catch {
    return fallbackCampaignPlan(analysis, campaignType, goal, duration);
  }
}
