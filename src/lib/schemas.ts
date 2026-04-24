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
    url: z.string().optional(),
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

  // Update-only: populated when re-analyzing after a push (not present on first analysis)
  improvements: z.array(z.string()).optional(),
  nextStepsTaken: z.array(z.object({
    step: z.string(),
    taken: z.boolean().default(false),
    evidence: z.string().default(''),
  })).optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ── Competitor deep analysis ──────────────────────────────────────────────────

export const CompetitorInsightSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  summary: z.string(),
  positioning: z.string(),
  messagingTone: z.string(),
  keyFeatures: z.array(z.string()),
  weaknesses: z.array(z.string()),
  differentiator: z.string(),
});

export const CompetitorInsightsResponseSchema = z.object({
  insights: z.array(CompetitorInsightSchema),
});

export type CompetitorInsight = z.infer<typeof CompetitorInsightSchema>;

// ── Social media profile insights ─────────────────────────────────────────────

export const SocialProfileInsightSchema = z.object({
  platform: z.string(),
  profileUrl: z.string(),
  sizeEstimate: z.string(),
  contentStyle: z.string(),
  postingFrequency: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  overallScore: z.coerce.number().min(0).max(10),
});

export const SocialAnalysisResponseSchema = z.object({
  profiles: z.array(SocialProfileInsightSchema),
  overallSummary: z.string(),
});

export type SocialProfileInsight = z.infer<typeof SocialProfileInsightSchema>;
export type SocialAnalysisResponse = z.infer<typeof SocialAnalysisResponseSchema>;

// ── Feedback analysis ─────────────────────────────────────────────────────────

export const FeedbackResultSchema = z.object({
  overallSentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  summary: z.string(),
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
    week: z.coerce.number(),
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
      percentage: z.coerce.number(),
      rationale: z.string(),
    })),
  }),
  quickWins: z.array(z.string()),
});

export type CampaignPlanResponse = z.infer<typeof CampaignPlanResponseSchema>;

// ── Analytics AI insights ─────────────────────────────────────────────────────

export const AnalyticsInsightsSchema = z.object({
  overallPerformance: z.enum(['growing', 'stable', 'declining', 'insufficient_data']),
  summary: z.string(),
  keyInsights: z.array(z.string()),
  warnings: z.array(z.string()),
  opportunities: z.array(z.string()),
  recommendations: z.array(z.string()),
  topWin: z.string(),
  topConcern: z.string(),
});

export type AnalyticsInsights = z.infer<typeof AnalyticsInsightsSchema>;

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
    // Strip markdown code fences (```json ... ``` or ``` ... ```) then retry
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      // Last resort: extract first JSON object
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error(`No JSON found in AI response: ${raw.substring(0, 200)}`);
      parsed = JSON.parse(match[0]);
    }
  }
  return schema.parse(parsed);
}
