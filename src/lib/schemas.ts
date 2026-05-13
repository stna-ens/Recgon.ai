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

  // Product website (if detectable from codebase or description)
  websiteUrl: z.string().optional(),

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

// ── Overview brief ───────────────────────────────────────────────────────────

export const OverviewBriefSchema = z.object({
  brief: z.string(),
  focusArea: z.string(),
});

export type OverviewBrief = z.infer<typeof OverviewBriefSchema>;

// ── Task verification + rating ────────────────────────────────────────────────

export const VerificationResultSchema = z.object({
  verdict: z.enum(['passed', 'failed', 'inconclusive']),
  confidence: z.coerce.number().min(0).max(1),
  reasoning: z.string(),
  // What evidence (if any) the LLM saw that justified the verdict.
  evidenceSummary: z.string().optional().default(''),
  regressions: z.array(z.string()).optional().default([]),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const ProofPayloadSchema = z.object({
  text: z.string().optional(),
  links: z.array(z.string()).optional(),
  attachments: z
    .array(z.object({ name: z.string(), url: z.string() }))
    .optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

export type ProofPayloadInput = z.infer<typeof ProofPayloadSchema>;

export const QualityRatingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  reasoning: z.string(),
});

export type QualityRating = z.infer<typeof QualityRatingSchema>;

export const EvidenceRouteSchema = z.object({
  source: z.enum([
    'github_commits',
    'ga4_metric',
    'marketing_artifacts',
    'instagram_graph',
    'web_fetch',
    'proof_writeup',
    'none',
  ]),
  // For web_fetch: which URL to actually fetch.
  url: z.string().optional(),
  reasoning: z.string(),
});

export type EvidenceRoute = z.infer<typeof EvidenceRouteSchema>;

// ── Task skill tagging ────────────────────────────────────────────────────────

export const TaskSkillTagsResponseSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      skills: z.array(z.string()).max(6),
    }),
  ),
});

export type TaskSkillTagsResponse = z.infer<typeof TaskSkillTagsResponseSchema>;

// ── Teammate profile skill normalization (Phase 1 / Plan 01-03) ─────────────
//
// Output schema for the `chatViaChain` call in `normalizeProfile.ts`. Each
// bucket (skills / strengths / interests) contains entries pairing the
// user's typed raw text with 0–6 canonical tags (post-hoc filtered to
// 0–3 after `CANONICAL_SET` membership check).
//
// Length + count caps are prompt-injection / cost guards (threat T-03-03):
// 80 chars per raw entry, 30 entries per skills bucket, 15 per
// strengths/interests bucket — keeps the per-save LLM payload bounded.

export const SkillNormalizationEntrySchema = z.object({
  raw: z.string().min(1).max(80),
  canonical: z.array(z.string().min(1).max(40)).max(6),
});

export const SkillNormalizationResultSchema = z.object({
  skills: z.array(SkillNormalizationEntrySchema).max(30),
  strengths: z.array(SkillNormalizationEntrySchema).max(15),
  interests: z.array(SkillNormalizationEntrySchema).max(15),
});

export type SkillNormalizationResult = z.infer<typeof SkillNormalizationResultSchema>;

// Phase 2 (SKILL-02 / QUAL-02). Output schema for the github_skill_inference
// LLM call. Length + count caps are prompt-injection / cost guards (T-02-10
// analog of T-03-03): max 10 skills total, canonical tag ≤ 40 chars,
// confidence 0..1, evidence is a 1-indexed commit reference (max 40 commits
// shown per call). The CANONICAL_SET post-hoc filter in
// `src/lib/recgon/githubSkills.ts` provides defense-in-depth (mirrors
// `normalizeProfile.ts:48-76`).
export const GithubInferredSkillSchema = z.object({
  canonical: z.string().min(1).max(40),
  confidence: z.number().min(0).max(1),
  evidence: z.number().int().min(1).max(40),
});

export const GithubSkillInferenceResultSchema = z.object({
  skills: z.array(GithubInferredSkillSchema).max(10),
});

export type GithubSkillInferenceResult = z.infer<typeof GithubSkillInferenceResultSchema>;

// Body schema for `POST /api/teams/[id]/profile`. The teammate's typed raw
// text per bucket plus an optional weekly capacity (null = unset, blank ≠
// zero per D-06).
export const ProfileSaveBodySchema = z.object({
  skillsRaw: z.array(z.string().min(1).max(80)).max(30),
  strengthsRaw: z.array(z.string().min(1).max(80)).max(15),
  interestsRaw: z.array(z.string().min(1).max(80)).max(15),
  weeklyCapacityHours: z.union([z.number().min(0).max(168), z.null()]),
});

export type ProfileSaveBody = z.infer<typeof ProfileSaveBodySchema>;

// Phase 2 / SKILL-05 (Plan 02-03). Body schema for the per-row inferred-skill
// PATCH endpoint. At least one of {rejected, reviewed} must be present so the
// route always has a deterministic mutation to perform. `rejected: true` sets
// `rejected_at = now()`; `rejected: false` clears it (6-second undo window).
// `reviewed: true` sets `user_reviewed_at = now()` for the single row.
export const InferredSkillPatchBodySchema = z
  .object({
    rejected: z.boolean().optional(),
    reviewed: z.boolean().optional(),
  })
  .refine(
    (v) => v.rejected !== undefined || v.reviewed !== undefined,
    { message: 'must include at least one of {rejected, reviewed}' },
  );

export type InferredSkillPatchBody = z.infer<typeof InferredSkillPatchBodySchema>;

// ── Phase 3 — LLM judgment overlay (Plan 01) ─────────────────────────────────
//
// Schema for the close-call tiebreaker prompt response. Paired with the
// `JUDGE_ASSIGNMENT_BATCH_SYSTEM` prompt in `prompts.ts` and consumed by
// `runJudgment` in `lib/recgon/judge.ts`. Any schema failure → caller does
// math-only fallback (JUDGE-05). Post-hoc content validation (substring
// checks against the candidate payload) is in `judge.ts` because Zod can't
// see the candidate data.

export const REASON_CODES = [
  'recent_track_record',
  'interest_match',
  'skill_depth',
  'task_kind_familiarity',
  'capacity_headroom',
] as const;

export const JudgePickSchema = z.object({
  task_id: z.string().min(1),
  chosen_candidate_id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  reason_code: z.enum(REASON_CODES),
  reason_sentence: z
    .string()
    .min(1)
    .max(150) // char ceiling — defense in depth alongside the word check
    .refine((s) => s.trim().split(/\s+/).length <= 25, {
      message: 'reason_sentence exceeds 25 words',
    }),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const JudgeResultSchema = z.object({
  picks: z.array(JudgePickSchema).min(1).max(10),
});

export type JudgePick = z.infer<typeof JudgePickSchema>;
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

// ── Phase 3 — LLM judgment overlay (Plan 03) ─────────────────────────────────
//
// Validation shape for the JSONB written to `agent_tasks.assignment_reasoning`.
// Branched on the `kind` discriminator: math-only OR llm-tiebreaker. The
// `llm_tiebreaker` branch references `JudgePickSchema` so any change to the
// judge response shape automatically flows through. Storage validates with
// this schema BEFORE writing the column — on parse failure we log + write
// `null` (do NOT fail the assignment; the "Why you" line is auditing copy,
// not the source-of-truth assignment).

const MathBreakdownSchema = z.object({
  skillOverlap: z.number(),
  fitForKind: z.number(),
  availabilityNow: z.number(),
  loadHeadroom: z.number(),
  interestNudge: z.number().optional().nullable(),
});

export const AssignmentReasoningSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('math_only'),
    mathScore: z.number(),
    mathBreakdown: MathBreakdownSchema,
  }),
  z.object({
    kind: z.literal('llm_tiebreaker'),
    mathScore: z.number(),
    mathBreakdown: MathBreakdownSchema,
    judge: JudgePickSchema,
  }),
]);

export type AssignmentReasoningPayload = z.infer<typeof AssignmentReasoningSchema>;

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
