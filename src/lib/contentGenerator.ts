import { chat } from './openai';
import { ProductAnalysis } from './storage';
import { generateMarketingImage } from './imageGenerator';
import { generateMarketingVideo } from './videoGenerator';
import { createJob, updateJob } from './videoJobs';
import { MARKETING_SYSTEM, marketingUserPrompt } from './prompts';
import { parseAIResponse, InstagramContentSchema, TikTokContentSchema, GoogleAdsContentSchema } from './schemas';

export type Platform = 'instagram' | 'tiktok' | 'google-ads';

export interface GeneratedContent {
  platform: Platform;
  content: Record<string, string>;
  imageUrl?: string | null;
  videoPath?: string | null;
  videoJobId?: string | null;
}

export async function generateMarketingContent(
  analysis: ProductAnalysis,
  platform: Platform,
  customPrompt?: string
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

  const isVideoContent = platform === 'instagram' || platform === 'tiktok';

  const result: GeneratedContent = {
    platform,
    content: {},
    imageUrl: null,
    videoPath: null,
    videoJobId: null,
  };

  if (isVideoContent) {
    // Start video generation in the background (don't block on it)
    const jobId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    createJob(jobId);
    result.videoJobId = jobId;

    // Fire and forget — runs in the background
    generateMarketingVideo(analysis, platform, customPrompt)
      .then((videoResult) => {
        updateJob(jobId, { status: 'done', videoPath: videoResult.videoPath });
        console.log(`[VideoJob ${jobId}] Done! Path: ${videoResult.videoPath}`);
      })
      .catch((err) => {
        const msg: string = err.message || 'Unknown error';
        const isQuota = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
        const userMessage = isQuota
          ? 'Daily video generation quota exceeded. Please try again tomorrow or request a quota increase at console.cloud.google.com.'
          : msg;
        updateJob(jobId, { status: 'error', error: userMessage });
        console.error(`[VideoJob ${jobId}] Failed:`, err);
      });

    // Only wait for text content
    const response = await chat(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 8192 });
    const schema = platform === 'instagram' ? InstagramContentSchema : TikTokContentSchema;
    result.content = parseAIResponse(response, schema) as Record<string, string>;
  } else {
    // Google Ads: generate image + text in parallel (images are fast)
    const [response, imageUrl] = await Promise.all([
      chat(systemPrompt, userPrompt, { temperature: 0.8, maxTokens: 8192 }),
      generateMarketingImage(analysis.name, analysis.description, platform, customPrompt),
    ]);

    if (typeof imageUrl === 'string') {
      result.imageUrl = imageUrl;
    }

    result.content = parseAIResponse(response, GoogleAdsContentSchema) as Record<string, string>;
  }

  return result;
}
