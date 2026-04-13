import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { renameConversation, deleteConversation, verifyConversationOwner } from '@/lib/chatStorage';
import { serverError } from '@/lib/apiError';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const owns = await verifyConversationOwner(session.user.id, id);
    if (!owns) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { title } = await request.json() as { title?: string };
    if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    await renameConversation(session.user.id, id, title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError('PATCH /api/chat/conversations/[id]', error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    await deleteConversation(session.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError('DELETE /api/chat/conversations/[id]', error);
  }
}
