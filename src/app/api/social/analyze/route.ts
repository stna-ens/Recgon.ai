import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { scrapeWebsite } from '@/lib/firecrawl';
import { chat } from '@/lib/gemini';
import { SOCIAL_ANALYSIS_SYSTEM, socialAnalysisUserPrompt } from '@/lib/prompts';
import { parseAIResponse, SocialAnalysisResponseSchema, SocialAnalysisResponse } from '@/lib/schemas';
import { serverError } from '@/lib/apiError';

// These platforms block automated scraping — scraping will always fail
const UNSCRAPPABLE_PLATFORMS = ['linkedin', 'facebook'];

function isUnscrappable(platform: string, url: string): boolean {
  const p = platform.toLowerCase();
  const u = url.toLowerCase();
  return UNSCRAPPABLE_PLATFORMS.some((name) => p.includes(name) || u.includes(name));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { profiles } = body as { profiles: { platform: string; url: string }[] };

    if (!profiles?.length) {
      return NextResponse.json({ error: 'At least one profile URL is required' }, { status: 400 });
    }

    // Check for platforms that block scraping
    const blocked = profiles.filter((p) => isUnscrappable(p.platform, p.url));
    if (blocked.length > 0) {
      const names = blocked.map((p) => p.platform).join(', ');
      return NextResponse.json(
        { error: `${names} blocks automated access. Try Instagram, TikTok, X, or YouTube instead.` },
        { status: 422 },
      );
    }

    // Scrape all profiles in parallel
    const scraped = await Promise.all(
      profiles.map(async (p) => ({
        platform: p.platform,
        url: p.url,
        content: await scrapeWebsite(p.url),
      }))
    );

    // If all scrapes failed, return a clear error instead of a hallucinated analysis
    if (scraped.every((p) => !p.content)) {
      return NextResponse.json(
        { error: 'Could not access any of the provided profiles. Make sure the profiles are public.' },
        { status: 422 },
      );
    }

    const userPrompt = socialAnalysisUserPrompt(scraped);
    const response = await chat(SOCIAL_ANALYSIS_SYSTEM, userPrompt, { temperature: 0.4, maxTokens: 4096 });
    const result: SocialAnalysisResponse = parseAIResponse(response, SocialAnalysisResponseSchema);

    return NextResponse.json(result);
  } catch (error) {
    return serverError('POST /api/social/analyze', error);
  }
}
