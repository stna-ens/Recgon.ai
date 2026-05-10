import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { serverError } from '@/lib/apiError';

// Returns the most recent assistant + user exchange across the user's
// mentor conversations, plus the conversation id so the home "pick up where
// you left off" card can deep-link straight back into the thread.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Most recent conversation by updated_at.
    const convRes = await supabase
      .from('chat_conversations')
      .select('id, title, updated_at, project_id')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // The select may fail if `project_id` column is missing on older
    // deployments — fall back to a column-free select rather than 500.
    let conv = convRes.data as { id: string; title: string; updated_at: number; project_id?: string | null } | null;
    if (convRes.error?.message?.includes('project_id')) {
      const fallback = await supabase
        .from('chat_conversations')
        .select('id, title, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      conv = (fallback.data ?? null) as typeof conv;
    }

    if (!conv) return NextResponse.json({ chat: null });

    // Pull the last 4 messages so we can show the most recent assistant
    // reply with the user's question above it for context.
    const msgsRes = await supabase
      .from('chat_messages')
      .select('role, content, ts')
      .eq('conversation_id', conv.id)
      .order('ts', { ascending: false })
      .limit(4);

    const msgs = (msgsRes.data ?? []).map((r) => ({
      role: (r.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: typeof r.content === 'string' ? r.content : '',
      ts: typeof r.ts === 'number' ? r.ts : 0,
    })).reverse();

    if (msgs.length === 0) return NextResponse.json({ chat: null });

    // Find the most recent assistant message and the user message that
    // prompted it (if any).
    const lastAssistantIdx = (() => {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') return i;
      }
      return -1;
    })();

    const lastAssistant = lastAssistantIdx >= 0 ? msgs[lastAssistantIdx] : null;
    const precedingUser =
      lastAssistantIdx > 0 && msgs[lastAssistantIdx - 1].role === 'user'
        ? msgs[lastAssistantIdx - 1]
        : null;

    return NextResponse.json({
      chat: {
        conversationId: conv.id,
        title: conv.title ?? 'New chat',
        projectId: conv.project_id ?? null,
        updatedAt: conv.updated_at,
        lastAssistant: lastAssistant
          ? { content: lastAssistant.content, ts: lastAssistant.ts }
          : null,
        precedingUser: precedingUser
          ? { content: precedingUser.content, ts: precedingUser.ts }
          : null,
      },
    });
  } catch (err) {
    return serverError('GET /api/overview/last-chat', err);
  }
}
