import { scrapeWebsite } from './firecrawl';
import { COMPETITOR_ANALYSIS_SYSTEM, competitorAnalysisUserPrompt } from './prompts';
import { CompetitorInsightsResponseSchema, CompetitorInsight } from './schemas';
import { ProductAnalysis } from './storage';
import { generateStructuredOutput } from './llm/quality';

export async function analyzeCompetitors(
  competitors: { name: string; url?: string; differentiator: string }[],
  analysis: ProductAnalysis,
): Promise<CompetitorInsight[]> {
  const withUrls = competitors.filter((c) => c.url);
  if (withUrls.length === 0) return [];

  // Scrape all competitor sites in parallel, ignore failures
  const scraped = await Promise.all(
    withUrls.map(async (c) => ({
      name: c.name,
      url: c.url,
      scrapedContent: await scrapeWebsite(c.url!) ?? `No content available for ${c.name}.`,
    }))
  );

  const userPrompt = competitorAnalysisUserPrompt(
    {
      name: analysis.name,
      description: analysis.description,
      uniqueSellingPoints: analysis.uniqueSellingPoints,
    },
    scraped,
  );

  const result = await generateStructuredOutput({
    taskKind: 'competitor_analysis',
    schema: CompetitorInsightsResponseSchema,
    systemPrompt: COMPETITOR_ANALYSIS_SYSTEM,
    userPrompt,
    options: { temperature: 0.3, maxTokens: 8192 },
    qualityProfile: 'competitor',
  });
  return result.insights;
}
