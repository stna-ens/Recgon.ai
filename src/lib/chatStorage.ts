import { supabase } from './supabase';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const MAX_MESSAGES = 120;

export async function getHistory(userId: string): Promise<StoredMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content, ts')
    .eq('user_id', userId)
    .order('ts', { ascending: true });

  return (data ?? []).map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    ts: r.ts,
  }));
}

export async function saveMessages(userId: string, msgs: StoredMessage[]) {
  if (msgs.length === 0) return;

  // Insert new messages
  const rows = msgs.map((m) => ({
    user_id: userId,
    role: m.role,
    content: m.content,
    ts: m.ts,
  }));
  await supabase.from('chat_messages').insert(rows);

  // Trim to MAX_MESSAGES: get count, delete oldest if over limit
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > MAX_MESSAGES) {
    const excess = count - MAX_MESSAGES;
    const { data: oldest } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('user_id', userId)
      .order('ts', { ascending: true })
      .limit(excess);

    if (oldest && oldest.length > 0) {
      const ids = oldest.map((r) => r.id);
      await supabase.from('chat_messages').delete().in('id', ids);
    }
  }
}

export async function clearHistory(userId: string) {
  await supabase.from('chat_messages').delete().eq('user_id', userId);
}
