import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { scrapeWebsite } from '@/lib/firecrawl';
import { chat } from '@/lib/gemini';
import { SOCIAL_ANALYSIS_SYSTEM, socialAnalysisUserPrompt } from '@/lib/prompts';
import { parseAIResponse, SocialAnalysisResponseSchema, SocialAnalysisResponse } from '@/lib/schemas';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { profiles } = body as { profiles: { platform: string; url: string }[] };

    if (!profiles?.length) {
      return NextResponse.json({ error: 'At least one profile URL is required' }, { status: 400 });
    }

    // Scrape all profiles in parallel
    const scraped = await Promise.all(
      profiles.map(async (p) => ({
        platform: p.platform,
        url: p.url,
        content: await scrapeWebsite(p.url),
      }))
    );

    const userPrompt = socialAnalysisUserPrompt(scraped);
    const response = await chat(SOCIAL_ANALYSIS_SYSTEM, userPrompt, { temperature: 0.4, maxTokens: 4096 });
    const result: SocialAnalysisResponse = parseAIResponse(response, SocialAnalysisResponseSchema);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Social media analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
