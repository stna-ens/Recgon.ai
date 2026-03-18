import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramProfileComments } from '@/lib/instagramScraper';
import { analyzeFeedback } from '@/lib/feedbackEngine';
import { validateEnv } from '@/lib/env';
import { isRateLimited, FEEDBACK_LIMIT } from '@/lib/rateLimit';
import { saveFeedbackToProject, generateId } from '@/lib/storage';
import { auth } from '@/auth';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'local';
  if (isRateLimited(`feedback-auto:${ip}`, FEEDBACK_LIMIT)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    validateEnv();
    const body = await request.json();
    const { profileUrl, projectId } = body as { profileUrl: string; projectId?: string };

    if (!profileUrl || !profileUrl.trim()) {
      return NextResponse.json({ error: 'profileUrl is required' }, { status: 400 });
    }

    console.log(`[API Auto] Fetching comments for profile: ${profileUrl}`);
    const comments = await fetchInstagramProfileComments(profileUrl);
    console.log(`[API Auto] Retrieved ${comments.length} comments. Analyzing...`);

    const result = await analyzeFeedback(comments);
    console.log(`[API Auto] Analysis complete.`);

    if (projectId) {
      const session = await auth();
      const analysis = {
        id: generateId(),
        rawFeedback: comments,
        sentiment: result.overallSentiment,
        sentimentBreakdown: result.sentimentBreakdown,
        themes: result.themes,
        featureRequests: result.featureRequests,
        bugs: result.bugs,
        praises: result.praises,
        developerPrompts: result.developerPrompts,
        analyzedAt: new Date().toISOString(),
      };
      saveFeedbackToProject(projectId, analysis, session?.user?.id);
    }

    return NextResponse.json({ comments, analysis: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auto feedback failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
