import { z } from 'zod';

// ── Codebase analysis ─────────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
  // Core identity
  name: z.string(),
  description: z.string(),
  techStack: z.array(z.string()),
  features: z.array(z.string()),
  targetAudience: z.string(),
  uniqueSellingPoints: z.array(z.string()),

  // Problem & market
  problemStatement: z.string(),
  marketOpportunity: z.string(),
  competitors: z.array(z.object({
    name: z.string(),
    differentiator: z.string(),
  })),

  // Business model
  businessModel: z.string(),
  revenueStreams: z.array(z.string()),
  pricingSuggestion: z.string(),

  // Product maturity
  currentStage: z.enum(['idea', 'mvp', 'beta', 'growth', 'mature']),

  // Strategic analysis
  swot: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  topRisks: z.array(z.string()),

  // Actionable guidance
  prioritizedNextSteps: z.array(z.string()),
  gtmStrategy: z.string(),
  earlyAdopterChannels: z.array(z.string()),
  growthMetrics: z.array(z.string()),
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

// ── Campaign planning ─────────────────────────────────────────────────────────

export const CampaignPlanResponseSchema = z.object({
  campaignName: z.string(),
  summary: z.string(),
  targetAudience: z.object({
    primary: z.string(),
    secondary: z.string(),
    painPoints: z.array(z.string()),
    motivations: z.array(z.string()),
  }),
  keyMessages: z.array(z.string()),
  channels: z.array(z.object({
    platform: z.string(),
    strategy: z.string(),
    frequency: z.string(),
    contentTypes: z.array(z.string()),
    estimatedReach: z.string(),
  })),
  phases: z.array(z.object({
    name: z.string(),
    duration: z.string(),
    objective: z.string(),
    tactics: z.array(z.string()),
    keyDeliverables: z.array(z.string()),
  })),
  contentCalendar: z.array(z.object({
    week: z.number(),
    platform: z.string(),
    contentType: z.string(),
    topic: z.string(),
    angle: z.string(),
    cta: z.string(),
    suggestedFormat: z.string(),
  })),
  kpis: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    platform: z.string(),
    timeframe: z.string(),
  })),
  budgetGuidance: z.object({
    totalRecommendation: z.string(),
    breakdown: z.array(z.object({
      channel: z.string(),
      percentage: z.number(),
      rationale: z.string(),
    })),
  }),
  quickWins: z.array(z.string()),
});

export type CampaignPlanResponse = z.infer<typeof CampaignPlanResponseSchema>;

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
