import { z } from 'zod';

// ── Codebase analysis ─────────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  name: z.string(),
  description: z.string(),
  techStack: z.array(z.string()),
  features: z.array(z.string()),
  targetAudience: z.string(),
  uniqueSellingPoints: z.array(z.string()),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ── Feedback analysis ─────────────────────────────────────────────────────────

export const FeedbackResultSchema = z.object({
  overallSentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  sentimentBreakdown: z.object({
    positive: z.number().min(0).max(100),
    neutral: z.number().min(0).max(100),
    negative: z.number().min(0).max(100),
  }),
  themes: z.array(z.string()),
  featureRequests: z.array(z.string()),
  bugs: z.array(z.string()),
  praises: z.array(z.string()),
  developerPrompts: z.array(z.string()),
});

export type FeedbackResult = z.infer<typeof FeedbackResultSchema>;

// ── Marketing content ─────────────────────────────────────────────────────────

export const InstagramContentSchema = z.object({
  caption: z.string(),
  hashtags: z.string(),
});

export const TikTokContentSchema = z.object({
  caption: z.string(),
  hashtags: z.string(),
});

export const GoogleAdsContentSchema = z.object({
  headline1: z.string(),
  headline2: z.string(),
  headline3: z.string(),
  description1: z.string(),
  description2: z.string(),
  keywords: z.string(),
  negativeKeywords: z.string(),
  displayUrl: z.string(),
  callToAction: z.string(),
});

export const MarketingContentSchema = z.union([
  InstagramContentSchema,
  TikTokContentSchema,
  GoogleAdsContentSchema,
]);

// ── Shared parse helper ───────────────────────────────────────────────────────

/**
 * Parse and validate a raw JSON string against a Zod schema.
 * Falls back to extracting the first JSON object from the string if
 * direct parsing fails (Gemini occasionally wraps output in markdown).
 */
export function parseAIResponse<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON found in AI response: ${raw.substring(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }
  return schema.parse(parsed);
}
