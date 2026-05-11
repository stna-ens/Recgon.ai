import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  AIQualityError,
  generateStructuredOutput,
  parseAndValidateAIResponse,
  validateAIQuality,
} from '../lib/llm/quality';
import {
  AnalyticsInsightsSchema,
  GoogleAdsContentSchema,
} from '../lib/schemas';

const chatMock = vi.fn();

vi.mock('../lib/gemini', () => ({
  chat: (...args: unknown[]) => chatMock(...args),
}));

describe('llm quality validators', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('enforces Google Ads character limits', () => {
    const issues = validateAIQuality('marketing_content', {
      headline1: 'This headline is definitely longer than thirty characters',
      headline2: 'Ship Faster',
      headline3: 'Try Recgon',
      description1: 'A short description.',
      description2: 'Another short description.',
      keywords: 'startup analysis, product strategy',
      negativeKeywords: 'free, cracked',
      displayUrl: 'recgon.ai/start',
      callToAction: 'Start',
    });

    expect(issues).toContain('headline1 exceeds 30 characters');
  });

  it('requires analytics insights to use numbers when data is sufficient', () => {
    const validShape = {
      overallPerformance: 'growing' as const,
      summary: 'Traffic is growing and acquisition quality looks strong.',
      keyInsights: [
        'Organic search is the strongest channel this period.',
        'Returning users are improving compared with the prior period.',
        'Engagement is healthiest on product pages.',
      ],
      warnings: ['Activation may still be uneven.'],
      opportunities: ['Double down on organic landing pages.'],
      recommendations: [
        'Publish one comparison page for the highest-intent search query this week.',
        'Add a CTA test on the product page where engagement is strongest.',
        'Review the highest-bounce traffic source before buying more ads.',
        'Create a weekly dashboard for sessions, activation, and signups.',
      ],
      topWin: 'Organic acquisition is improving.',
      topConcern: 'Activation quality needs closer tracking.',
    };

    expect(() =>
      parseAndValidateAIResponse(JSON.stringify(validShape), AnalyticsInsightsSchema, 'analytics_insights', 'analytics'),
    ).toThrow(AIQualityError);
  });

  it('repairs valid JSON shape that fails task quality checks', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify({
        caption: 'Improve UX',
        hashtags: '#startup',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        caption: 'Founder teams lose hours turning scattered product feedback into clear engineering work. Recgon analyzes the comments, finds the highest-friction workflow, and turns it into one concrete dev prompt. Try it before your next sprint planning session.',
        hashtags: '#founder #productmanagement #startup #userfeedback',
      }));

    const result = await generateStructuredOutput({
      taskKind: 'marketing_content',
      schema: z.object({ caption: z.string(), hashtags: z.string() }),
      systemPrompt: 'system',
      userPrompt: 'user',
      options: { temperature: 0.8 },
      qualityProfile: 'marketing',
    });

    expect(result.caption).toContain('Recgon analyzes');
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][1]).toContain('QUALITY ISSUES');
  });

  it('accepts high-quality fixture outputs', () => {
    const ad = GoogleAdsContentSchema.parse({
      headline1: 'Analyze Your Startup',
      headline2: 'Founder AI Mentor',
      headline3: 'Ship Better Bets',
      description1: 'Turn repos into specific product, GTM, and dev next steps.',
      description2: 'Built for solo founders who need sharper decisions before more code.',
      keywords: 'startup analysis, founder tools, product strategy',
      negativeKeywords: 'free template, enterprise crm',
      displayUrl: 'recgon.ai/analyze',
      callToAction: 'Analyze Project',
    });

    expect(validateAIQuality('marketing_content', ad, 'marketing')).toEqual([]);
  });
});
