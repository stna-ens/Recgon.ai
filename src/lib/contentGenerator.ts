import { chat } from './openai';
import { ProductAnalysis } from './storage';
import { MARKETING_SYSTEM, marketingUserPrompt, CAMPAIGN_SYSTEM, campaignUserPrompt, CampaignType } from './prompts';
import { parseAIResponse, InstagramContentSchema, TikTokContentSchema, GoogleAdsContentSchema, CampaignPlanResponseSchema, CampaignPlanResponse } from './schemas';

export type Platform = 'instagram' | 'tiktok' | 'google-ads';
export type { CampaignType };

export interface GeneratedContent {
  platform: Platform;
  content: Record<string, string>;
}

export async function generateMarketingContent(
  analysis: ProductAnalysis,
  platform: Platform,
  customPrompt?: string,
): Promise<GeneratedContent> {
  const systemPrompt = MARKETING_SYSTEM[platform];
  if (!systemPrompt) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const userPrompt = marketingUserPrompt(
    analysis.name,
    analysis.description,
    analysis.techStack,
    analysis.features,
    analysis.targetAudience,
    analysis.uniqueSellingPoints,
    customPrompt,
  );

  const schema = (platform === 'instagram'
    ? InstagramContentSchema
    : platform === 'tiktok'
    ? TikTokContentSchema
    : GoogleAdsContentSchema) as import('zod').ZodType<Record<string, string>>;

  const response = await chat(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 8192 });
  return {
    platform,
    content: parseAIResponse(response, schema) as Record<string, string>,
  };
}

export async function generateCampaignPlan(
  analysis: ProductAnalysis,
  campaignType: CampaignType,
  goal: string,
  duration: string,
): Promise<CampaignPlanResponse> {
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
  );

  const response = await chat(CAMPAIGN_SYSTEM, userPrompt, { temperature: 0.8, maxTokens: 16384 });
  return parseAIResponse(response, CampaignPlanResponseSchema);
}
