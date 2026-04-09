import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { chat } from '@/lib/gemini';
import { ANALYTICS_SYSTEM, analyticsUserPrompt } from '@/lib/prompts';
import { AnalyticsInsightsSchema, parseAIResponse } from '@/lib/schemas';
import { serverError } from '@/lib/apiError';

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
    const insights = parseAIResponse(raw, AnalyticsInsightsSchema);
    return NextResponse.json(insights);
  } catch (err) {
    return serverError('POST /api/analytics/analyze', err);
  }
}
