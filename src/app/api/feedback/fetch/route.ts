import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramComments } from '@/lib/instagramScraper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, platform } = body;

    if (!url || !platform) {
      return NextResponse.json(
        { error: 'url and platform are required' },
        { status: 400 }
      );
    }

    if (platform === 'instagram') {
      console.log(`[API Fetch] Fetching comments for URL: ${url}`);
      const comments = await fetchInstagramComments(url);
      console.log(`[API Fetch] Retrieved ${comments.length} comments.`);
      return NextResponse.json({ comments });
    }

    return NextResponse.json(
      { error: `Platform '${platform}' is not supported yet.` },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch comments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
