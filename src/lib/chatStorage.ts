import { supabase } from './supabase';
import { randomUUID } from 'crypto';

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  projectId: string | null;
}

const MAX_MESSAGES = 120;

export async function listConversations(userId: string): Promise<ChatConversation[]> {
  const { data } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, updated_at, project_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    projectId: r.project_id ?? null,
  }));
}

export async function createConversation(
  userId: string,
  title?: string,
  projectId?: string | null,
): Promise<ChatConversation> {
  const now = Date.now();
  const id = randomUUID();
  const row = {
    id,
    user_id: userId,
    title: title?.trim() || 'New chat',
    created_at: now,
    updated_at: now,
    project_id: projectId ?? null,
  };
  const { error } = await supabase.from('chat_conversations').insert(row);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return { id, title: row.title, createdAt: now, updatedAt: now, projectId: projectId ?? null };
}

export async function setConversationProject(userId: string, convId: string, projectId: string | null) {
  await supabase
    .from('chat_conversations')
    .update({ project_id: projectId, updated_at: Date.now() })
    .eq('id', convId)
    .eq('user_id', userId)
    .throwOnError();
}

export async function renameConversation(userId: string, convId: string, title: string) {
  const trimmed = title.trim().slice(0, 120) || 'New chat';
  await supabase
    .from('chat_conversations')
    .update({ title: trimmed, updated_at: Date.now() })
    .eq('id', convId)
    .eq('user_id', userId)
    .throwOnError();
}

export async function deleteConversation(userId: string, convId: string) {
  await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', convId)
    .eq('user_id', userId)
    .throwOnError();
}

export async function verifyConversationOwner(userId: string, convId: string): Promise<boolean> {
  const { data } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('id', convId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function getConversationMessages(convId: string): Promise<StoredMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content, ts')
    .eq('conversation_id', convId)
    .order('ts', { ascending: true });

  return (data ?? []).map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    ts: r.ts,
  }));
}

export async function saveMessages(userId: string, convId: string, msgs: StoredMessage[]) {
  if (msgs.length === 0) return;

  const rows = msgs.map((m) => ({
    user_id: userId,
    conversation_id: convId,
    role: m.role,
    content: m.content,
    ts: m.ts,
  }));
  await supabase.from('chat_messages').insert(rows).throwOnError();

  await supabase
    .from('chat_conversations')
    .update({ updated_at: Date.now() })
    .eq('id', convId)
    .eq('user_id', userId)
    .throwOnError();

  // Trim to MAX_MESSAGES per conversation
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', convId);

  if (count && count > MAX_MESSAGES) {
    const excess = count - MAX_MESSAGES;
    const { data: oldest } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', convId)
      .order('ts', { ascending: true })
      .limit(excess);

    if (oldest && oldest.length > 0) {
      const ids = oldest.map((r) => r.id);
      await supabase.from('chat_messages').delete().in('id', ids);
    }
  }
}

export function deriveTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, ' ');
  if (clean.length <= 40) return clean || 'New chat';
  const slice = clean.slice(0, 40);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 20 ? slice.slice(0, lastSpace) : slice) + '…';
}
