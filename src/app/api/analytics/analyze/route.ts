import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { chat } from '@/lib/gemini';
import { ANALYTICS_SYSTEM, analyticsUserPrompt } from '@/lib/prompts';
import { AnalyticsInsightsSchema, parseAIResponse } from '@/lib/schemas';
import { serverError } from '@/lib/apiError';

function fallbackInsightsFromRaw(raw: string) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const summary = sentences[0] ?? 'Analytics summary generated, but structured insight formatting failed.';
  const keyInsights = sentences.slice(1, 4);
  const topWin = keyInsights[0] ?? 'Traffic and behavior data was fetched successfully.';

  return {
    overallPerformance: 'insufficient_data' as const,
    summary,
    keyInsights,
    warnings: ['The AI response format was degraded; showing a simplified summary.'],
    opportunities: sentences.slice(4, 6),
    recommendations: [
      'Re-run insights in 1-2 minutes for a fully structured report.',
      'Use the trend and channel charts to validate this summary before acting.',
    ],
    topWin,
    topConcern: 'Could not extract the full structured insight payload from the model response.',
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, days } = await req.json();
  if (!data) return NextResponse.json({ error: 'Missing analytics data' }, { status: 400 });

  try {
    const raw = await chat(ANALYTICS_SYSTEM, analyticsUserPrompt(data, days ?? 30), {
      temperature: 0.5,
      maxTokens: 4096,
    });
    let insights;
    try {
      insights = parseAIResponse(raw, AnalyticsInsightsSchema);
    } catch {
      insights = fallbackInsightsFromRaw(raw);
    }
    return NextResponse.json(insights);
  } catch (err) {
    return serverError('POST /api/analytics/analyze', err);
  }
}
