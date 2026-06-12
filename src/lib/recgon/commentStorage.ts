import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Task-thread comments (Phase B). Modeled on chatStorage.ts: thin mappers,
// explicit column lists, fail-soft when the table hasn't been migrated yet
// (a missing table must degrade to an empty thread, never a 500 — same
// philosophy as the inbox route's layered SELECT fallbacks).

export interface TaskComment {
  id: string;
  taskId: string;
  teamId: string;
  authorUserId: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export const COMMENT_MAX_LENGTH = 4000;

type CommentRow = {
  id: string;
  task_id: string;
  team_id: string;
  author_user_id: string;
  body: string;
  mentions: unknown;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

const COMMENT_SELECT =
  'id, task_id, team_id, author_user_id, body, mentions, created_at, edited_at, deleted_at';

function mapComment(row: CommentRow): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    teamId: row.team_id,
    authorUserId: row.author_user_id,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions.filter((m): m is string => typeof m === 'string') : [],
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

// Postgres "relation does not exist".
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42P01' || /task_comments.*does not exist/i.test(error?.message ?? '');
}

export async function listComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comments')
    .select(COMMENT_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`listComments failed: ${error.message}`);
  }
  return ((data ?? []) as CommentRow[]).map(mapComment);
}

export async function addComment(input: {
  taskId: string;
  teamId: string;
  authorUserId: string;
  body: string;
  mentions?: string[];
}): Promise<TaskComment> {
  const body = input.body.trim().slice(0, COMMENT_MAX_LENGTH);
  if (!body) throw new Error('comment body is empty');
  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: input.taskId,
      team_id: input.teamId,
      author_user_id: input.authorUserId,
      body,
      mentions: input.mentions ?? [],
    })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw new Error(`addComment failed: ${error?.message}`);
  return mapComment(data as CommentRow);
}

export async function softDeleteComment(
  commentId: string,
  authorUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('task_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('author_user_id', authorUserId)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new Error(`softDeleteComment failed: ${error.message}`);
  return (data ?? []).length > 0;
}

// ── AI context (Phase B6) ───────────────────────────────────────────────────
//
// The moat: Recgon reads the discussion. This builder is the ONLY way
// comments enter a prompt, and it enforces three guarantees:
//   1. Bounded — last N non-deleted comments, hard char budget.
//   2. Anonymized — author identity never reaches the model. The judge
//      compares anonymous candidates; a comment signed "Ada" would
//      deanonymize her, so every comment is attributed to "a teammate".
//   3. Untrusted — each body goes through wrapUntrusted (QUAL-02) so a
//      comment can't smuggle prompt instructions.

const CONTEXT_COMMENT_COUNT = 5;
const CONTEXT_CHAR_BUDGET = 1500;
const CONTEXT_PER_COMMENT_CHARS = 400;

export async function buildRecentCommentsBlock(taskId: string): Promise<string | null> {
  let comments: TaskComment[];
  try {
    comments = await listComments(taskId);
  } catch (err) {
    logger.warn('buildRecentCommentsBlock: listComments failed', {
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  const live = comments.filter((c) => !c.deletedAt).slice(-CONTEXT_COMMENT_COUNT);
  if (live.length === 0) return null;

  // Imported lazily to keep this module loadable in client-adjacent tests
  // that stub the supabase client only.
  const { wrapUntrusted } = await import('@/lib/llm/utils');

  const lines: string[] = [];
  let used = 0;
  for (const c of live) {
    const trimmed =
      c.body.length > CONTEXT_PER_COMMENT_CHARS
        ? c.body.slice(0, CONTEXT_PER_COMMENT_CHARS - 1) + '…'
        : c.body;
    const wrapped = `A teammate commented: ${wrapUntrusted(trimmed)}`;
    if (used + wrapped.length > CONTEXT_CHAR_BUDGET) break;
    lines.push(wrapped);
    used += wrapped.length;
  }
  if (lines.length === 0) return null;
  return lines.join('\n');
}
