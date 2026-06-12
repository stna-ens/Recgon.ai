import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { verifyTeamAccess } from '@/lib/teamStorage';
import { getTask, listTeammates } from '@/lib/recgon/storage';
import {
  addComment,
  listComments,
  softDeleteComment,
  COMMENT_MAX_LENGTH,
} from '@/lib/recgon/commentStorage';
import { notifyCommentMention } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// Task thread = comments + a curated slice of the activity log, merged
// into one chronological stream.
//
// Privacy notes (CR-01 adjacent):
//   - Event payloads are NEVER serialized wholesale. Several carry
//     dispatch internals (score breakdowns, prior triage notes); only the
//     whitelisted display fields below survive.
//   - 'rated' / 'overloaded' / 'no_fit' events are excluded entirely —
//     they describe a teammate's standing, not the task's history.

const EVENT_WHITELIST = new Set([
  'assigned',
  'accepted',
  'declined',
  'completed',
  'reassigned',
  'manually_assigned',
  'triaged',
  'deferred',
  'nudged',
  'escalated',
  'auto_rescheduled',
  'snoozed',
  'rescheduled',
  'reschedule_requested',
  'reschedule_dismissed',
  'edited',
]);

// payload key → serialized key. Everything else is dropped.
const SAFE_PAYLOAD_KEYS: Record<string, string> = {
  days: 'days',
  scheduledDate: 'scheduledDate',
  requestedDate: 'requestedDate',
};

type ThreadItem =
  | {
      type: 'comment';
      id: string;
      body: string;
      authorUserId: string;
      authorName: string;
      mine: boolean;
      ts: string;
      editedAt: string | null;
    }
  | {
      type: 'event';
      id: string;
      event: string;
      actorName: string | null;
      detail: Record<string, string | number>;
      ts: string;
    };

async function authorize(teamId: string, taskId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }
  const task = await getTask(taskId);
  if (!task || task.teamId !== teamId) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { session, role, task };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const ctx = await authorize(teamId, taskId);
  if ('error' in ctx) return ctx.error;
  const userId = ctx.session.user!.id as string;

  const [comments, teammates, eventsRes] = await Promise.all([
    listComments(taskId),
    listTeammates(teamId),
    supabase
      .from('teammate_event_log')
      .select('id, event, teammate_id, payload, ts')
      .eq('task_id', taskId)
      .order('ts', { ascending: true })
      .limit(100),
  ]);

  // Author names: comment authors are users (not teammates). Resolve
  // nicknames in one batched query.
  const authorIds = Array.from(
    new Set(comments.filter((c) => !c.deletedAt).map((c) => c.authorUserId)),
  );
  const usersRes = authorIds.length
    ? await supabase.from('users').select('id, nickname').in('id', authorIds)
    : { data: [], error: null };
  const nicknameById = new Map<string, string>();
  (usersRes.data ?? []).forEach((u) => nicknameById.set(u.id as string, (u.nickname as string) || ''));

  const teammateNameById = new Map<string, string>();
  teammates.forEach((tm) => teammateNameById.set(tm.id, tm.displayName));

  const items: ThreadItem[] = [];

  for (const c of comments) {
    if (c.deletedAt) continue;
    items.push({
      type: 'comment',
      id: c.id,
      body: c.body,
      authorUserId: c.authorUserId,
      authorName: nicknameById.get(c.authorUserId) || '—',
      mine: c.authorUserId === userId,
      ts: c.createdAt,
      editedAt: c.editedAt,
    });
  }

  if (!eventsRes.error) {
    for (const row of eventsRes.data ?? []) {
      const event = row.event as string;
      if (!EVENT_WHITELIST.has(event)) continue;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const detail: Record<string, string | number> = {};
      for (const [from, to] of Object.entries(SAFE_PAYLOAD_KEYS)) {
        const v = payload[from];
        if (typeof v === 'string' || typeof v === 'number') detail[to] = v;
      }
      items.push({
        type: 'event',
        id: row.id as string,
        event,
        actorName: row.teammate_id ? teammateNameById.get(row.teammate_id as string) ?? null : null,
        detail,
        ts: row.ts as string,
      });
    }
  } else {
    logger.warn('thread: event log query failed', { taskId, err: eventsRes.error.message });
  }

  items.sort((a, b) => a.ts.localeCompare(b.ts));

  return NextResponse.json({ items, canComment: ctx.role !== 'viewer' });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const ctx = await authorize(teamId, taskId);
  if ('error' in ctx) return ctx.error;
  if (ctx.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers cannot comment' }, { status: 403 });
  }
  const userId = ctx.session.user!.id as string;

  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 });
  if (text.length > COMMENT_MAX_LENGTH) {
    return NextResponse.json({ error: `Comment is too long (max ${COMMENT_MAX_LENGTH})` }, { status: 400 });
  }

  // Resolve @mentions against the team's member users (nickname match,
  // case-insensitive, spaces ignored: "@Ada Lovelace" matches "@adalovelace"
  // only if typed without the space — v1 keeps the parser dumb on purpose).
  const teammates = await listTeammates(teamId);
  const userIds = teammates.map((tm) => tm.userId).filter((u): u is string => !!u);
  const usersRes = userIds.length
    ? await supabase.from('users').select('id, nickname, email').in('id', userIds)
    : { data: [], error: null };
  const members = (usersRes.data ?? []) as { id: string; nickname: string | null; email: string }[];

  const mentionTokens = Array.from(text.matchAll(/@([\p{L}\p{N}._-]+)/gu)).map((m) =>
    m[1].toLowerCase(),
  );
  const mentioned = members.filter((m) => {
    if (!m.nickname || m.id === userId) return false;
    const compact = m.nickname.toLowerCase().replace(/\s+/g, '');
    return mentionTokens.includes(compact);
  });

  const comment = await addComment({
    taskId,
    teamId,
    authorUserId: userId,
    body: text,
    mentions: mentioned.map((m) => m.id),
  });

  // Fire-and-forget mention emails.
  if (mentioned.length > 0) {
    const author = members.find((m) => m.id === userId);
    const teamRes = await supabase.from('teams').select('name').eq('id', teamId).single();
    const teamName = (teamRes.data?.name as string) ?? 'Team';
    for (const m of mentioned) {
      void notifyCommentMention({
        email: m.email,
        mentionedByName: author?.nickname || 'A teammate',
        taskTitle: ctx.task.title,
        taskId,
        teamName,
        snippet: text.slice(0, 200),
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    item: {
      type: 'comment',
      id: comment.id,
      body: comment.body,
      authorUserId: comment.authorUserId,
      authorName: members.find((m) => m.id === userId)?.nickname || '—',
      mine: true,
      ts: comment.createdAt,
      editedAt: null,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: teamId, taskId } = await params;
  const ctx = await authorize(teamId, taskId);
  if ('error' in ctx) return ctx.error;
  const userId = ctx.session.user!.id as string;

  const body = (await request.json().catch(() => ({}))) as { commentId?: string };
  if (!body.commentId) {
    return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
  }
  // Author-only: the WHERE clause enforces it; a non-author delete is a no-op.
  const removed = await softDeleteComment(body.commentId, userId);
  if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
