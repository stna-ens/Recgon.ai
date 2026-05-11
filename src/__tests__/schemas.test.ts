import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  AnalysisResultSchema,
  InstagramContentSchema,
  TikTokContentSchema,
  GoogleAdsContentSchema,
  CampaignPlanResponseSchema,
  AnalyticsInsightsSchema,
  parseAIResponse,
} from '../lib/schemas';

// ── parseAIResponse ──────────────────────────────────────────────────────────

describe('parseAIResponse', () => {
  const simpleSchema = z.object({
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    score: z.number(),
  });

  const validPayload = { sentiment: 'positive' as const, score: 80 };

  it('parses valid JSON directly', () => {
    const result = parseAIResponse(JSON.stringify(validPayload), simpleSchema);
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBe(80);
  });

  it('handles markdown-wrapped JSON (```json ... ```)', () => {
    const wrapped = '```json\n' + JSON.stringify(validPayload) + '\n```';
    const result = parseAIResponse(wrapped, simpleSchema);
    expect(result.sentiment).toBe('positive');
  });

  it('handles markdown-wrapped JSON without language tag', () => {
    const wrapped = '```\n' + JSON.stringify(validPayload) + '\n```';
    const result = parseAIResponse(wrapped, simpleSchema);
    expect(result.sentiment).toBe('positive');
  });

  it('extracts JSON from surrounding text', () => {
    const messy = 'Here is the result:\n' + JSON.stringify(validPayload) + '\nHope that helps!';
    const result = parseAIResponse(messy, simpleSchema);
    expect(result.sentiment).toBe('positive');
  });

  it('throws on no JSON found', () => {
    expect(() => parseAIResponse('no json here', simpleSchema)).toThrow('No JSON found');
  });

  it('throws on invalid schema match', () => {
    const invalid = JSON.stringify({ sentiment: 'invalid_value', score: 0 });
    expect(() => parseAIResponse(invalid, simpleSchema)).toThrow();
  });
});

// ── AnalysisResultSchema ─────────────────────────────────────────────────────

describe('AnalysisResultSchema', () => {
  const validAnalysis = {
    name: 'TestApp',
    description: 'A test application',
    techStack: ['React', 'Node.js'],
    features: ['Auth', 'Dashboard'],
    targetAudience: 'Developers',
    uniqueSellingPoints: ['Fast', 'Simple'],
    problemStatement: 'Complex tools',
    marketOpportunity: 'Growing market',
    competitors: [{ name: 'Competitor A', differentiator: 'More features' }],
    businessModel: 'SaaS',
    revenueStreams: ['Subscriptions'],
    pricingSuggestion: '$10/mo',
    currentStage: 'mvp' as const,
    swot: {
      strengths: ['Fast'],
      weaknesses: ['Small team'],
      opportunities: ['New market'],
      threats: ['Big competitors'],
    },
    topRisks: ['Funding'],
    prioritizedNextSteps: ['Launch beta'],
    gtmStrategy: 'Product-led growth',
    earlyAdopterChannels: ['Hacker News'],
    growthMetrics: ['DAU'],
  };

  it('validates a complete analysis', () => {
    const result = AnalysisResultSchema.parse(validAnalysis);
    expect(result.name).toBe('TestApp');
    expect(result.currentStage).toBe('mvp');
  });

  it('accepts optional improvements field', () => {
    const withImprovements = { ...validAnalysis, improvements: ['Added auth'] };
    const result = AnalysisResultSchema.parse(withImprovements);
    expect(result.improvements).toEqual(['Added auth']);
  });

  it('accepts optional nextStepsTaken field', () => {
    const withSteps = {
      ...validAnalysis,
      nextStepsTaken: [{ step: 'Launch beta', taken: true, evidence: 'Beta is live' }],
    };
    const result = AnalysisResultSchema.parse(withSteps);
    expect(result.nextStepsTaken?.[0].taken).toBe(true);
  });

  it('rejects invalid currentStage', () => {
    const invalid = { ...validAnalysis, currentStage: 'invalid' };
    expect(() => AnalysisResultSchema.parse(invalid)).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => AnalysisResultSchema.parse({ name: 'Test' })).toThrow();
  });
});

// ── Marketing schemas ────────────────────────────────────────────────────────

describe('MarketingContentSchemas', () => {
  it('validates Instagram content', () => {
    const result = InstagramContentSchema.parse({ caption: 'Test', hashtags: '#test' });
    expect(result.caption).toBe('Test');
  });

  it('validates TikTok content', () => {
    const result = TikTokContentSchema.parse({ caption: 'Test', hashtags: '#test' });
    expect(result.caption).toBe('Test');
  });

  it('validates Google Ads content', () => {
    const result = GoogleAdsContentSchema.parse({
      headline1: 'H1', headline2: 'H2', headline3: 'H3',
      description1: 'D1', description2: 'D2',
      keywords: 'kw', negativeKeywords: 'nkw',
      displayUrl: 'example.com', callToAction: 'Sign Up',
    });
    expect(result.headline1).toBe('H1');
  });
});

// ── AnalyticsInsightsSchema ──────────────────────────────────────────────────

describe('AnalyticsInsightsSchema', () => {
  it('validates all performance states', () => {
    for (const perf of ['growing', 'stable', 'declining', 'insufficient_data']) {
      const result = AnalyticsInsightsSchema.parse({
        overallPerformance: perf,
        summary: 'Test',
        keyInsights: [], warnings: [], opportunities: [], recommendations: [],
        topWin: 'Win', topConcern: 'Concern',
      });
      expect(result.overallPerformance).toBe(perf);
    }
  });
});

// ── CampaignPlanResponseSchema ───────────────────────────────────────────────

describe('CampaignPlanResponseSchema', () => {
  it('validates a minimal campaign plan', () => {
    const plan = {
      campaignName: 'Launch Campaign',
      summary: 'A campaign',
      targetAudience: { primary: 'Devs', secondary: 'PMs', painPoints: ['time'], motivations: ['ship'] },
      keyMessages: ['Fast shipping'],
      channels: [{ platform: 'Twitter', strategy: 'Post daily', frequency: 'Daily', contentTypes: ['Tweet'], estimatedReach: '1K' }],
      phases: [{ name: 'Phase 1', duration: '2 weeks', objective: 'Awareness', tactics: ['Post'], keyDeliverables: ['Content'] }],
      contentCalendar: [{ week: 1, platform: 'Twitter', contentType: 'Tweet', topic: 'Launch', angle: 'Excitement', cta: 'Sign up', suggestedFormat: 'Text' }],
      kpis: [{ metric: 'Signups', target: '100', platform: 'Web', timeframe: '1 month' }],
      budgetGuidance: { totalRecommendation: '$500', breakdown: [{ channel: 'Twitter', percentage: 100, rationale: 'Primary channel' }] },
      quickWins: ['Post announcement'],
    };
    const result = CampaignPlanResponseSchema.parse(plan);
    expect(result.campaignName).toBe('Launch Campaign');
  });

  it('coerces week numbers from strings', () => {
    const plan = {
      campaignName: 'Test',
      summary: 'Test',
      targetAudience: { primary: 'A', secondary: 'B', painPoints: [], motivations: [] },
      keyMessages: [],
      channels: [],
      phases: [],
      contentCalendar: [{ week: '2', platform: 'X', contentType: 'T', topic: 'T', angle: 'A', cta: 'C', suggestedFormat: 'F' }],
      kpis: [],
      budgetGuidance: { totalRecommendation: '$0', breakdown: [] },
      quickWins: [],
    };
    const result = CampaignPlanResponseSchema.parse(plan);
    expect(result.contentCalendar[0].week).toBe(2);
  });
});
