import { NextRequest, NextResponse } from 'next/server';
import { analyzeFeedback } from '@/lib/feedbackEngine';
import { validateEnv } from '@/lib/env';
import { isRateLimited, FEEDBACK_LIMIT } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (isRateLimited(`feedback:${ip}`, FEEDBACK_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { feedback } = body as { feedback: string[] };

    if (!feedback || !Array.isArray(feedback) || feedback.length === 0) {
      return NextResponse.json(
        { error: 'feedback must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    validateEnv();
    console.log(`[API Analyze] Analyzing ${feedback.length} items.`);
    const result = await analyzeFeedback(feedback);
    console.log(`[API Analyze] Analysis complete.`);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Feedback analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
