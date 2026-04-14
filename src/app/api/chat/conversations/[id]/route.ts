import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { renameConversation, deleteConversation, verifyConversationOwner, setConversationProject } from '@/lib/chatStorage';
import { serverError } from '@/lib/apiError';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const owns = await verifyConversationOwner(session.user.id, id);
    if (!owns) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json() as { title?: string; projectId?: string | null };

    if (typeof body.title === 'string' && body.title.trim()) {
      await renameConversation(session.user.id, id, body.title);
    }
    if (body.projectId !== undefined) {
      await setConversationProject(session.user.id, id, body.projectId);
    }
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
