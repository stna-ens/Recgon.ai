export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listConversations, createConversation } from '@/lib/chatStorage';
import { serverError } from '@/lib/apiError';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const conversations = await listConversations(session.user.id);
    return NextResponse.json({ conversations });
  } catch (error) {
    return serverError('GET /api/chat/conversations', error);
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as { title?: string };
    const conv = await createConversation(session.user.id, body.title);
    return NextResponse.json({ conversation: conv });
  } catch (error) {
    return serverError('POST /api/chat/conversations', error);
  }
}
