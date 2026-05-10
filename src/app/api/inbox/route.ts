import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { runTaskVerification } from '@/lib/recgon/verify';
import { logger } from '@/lib/logger';

function isInsightOnlySourceRef(ref: unknown): boolean {
  return Boolean(ref && typeof ref === 'object' && (ref as { kind?: unknown }).kind === 'top_risk');
}

const INBOX_BASE_SELECT = 'id, team_id, project_id, title, description, kind, source, source_ref, priority, status, assigned_at, deadline, scheduled_date, schedule_note, result, created_at, completed_at, assigned_to, verification_status, verification_evidence';
const INBOX_RESCHEDULE_SELECT = `${INBOX_BASE_SELECT}, reschedule_request_status, reschedule_requested_at, reschedule_requested_by, reschedule_request_note, reschedule_requested_date`;

type InboxTaskRow = {
  id: string;
  team_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  source: string;
  source_ref: Record<string, unknown> | null;
  priority: number;
  status: string;
  assigned_at: string | null;
  deadline: string | null;
  scheduled_date?: string | null;
  schedule_note?: string | null;
  reschedule_request_status?: string | null;
  reschedule_requested_at?: string | null;
  reschedule_requested_by?: string | null;
  reschedule_request_note?: string | null;
  reschedule_requested_date?: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  assigned_to: string | null;
  verification_status: string | null;
  verification_evidence: Record<string, unknown> | null;
};

function withRescheduleDefaults(task: InboxTaskRow): InboxTaskRow {
  return {
    ...task,
    scheduled_date: task.scheduled_date ?? null,
    schedule_note: task.schedule_note ?? null,
    reschedule_request_status: task.reschedule_request_status ?? 'none',
    reschedule_requested_at: task.reschedule_requested_at ?? null,
    reschedule_requested_by: task.reschedule_requested_by ?? null,
    reschedule_request_note: task.reschedule_request_note ?? null,
    reschedule_requested_date: task.reschedule_requested_date ?? null,
  };
}

async function fetchInboxTasks(teammateIds: string[]): Promise<{ tasks: InboxTaskRow[]; error?: string }> {
  const run = (select: string) => supabase
    .from('agent_tasks')
    .select(select)
    .in('assigned_to', teammateIds)
    .in('status', ['assigned', 'accepted', 'in_progress', 'awaiting_review'])
    .order('priority', { ascending: true })
    .order('assigned_at', { ascending: false })
    .limit(100);

  const primary = await run(INBOX_RESCHEDULE_SELECT);
  if (!primary.error) return { tasks: ((primary.data ?? []) as unknown as InboxTaskRow[]).map(withRescheduleDefaults) };
  if (primary.error.code !== '42703') return { tasks: [], error: primary.error.message };

  const fallback = await run(INBOX_BASE_SELECT);
  if (fallback.error) return { tasks: [], error: fallback.error.message };
  return { tasks: ((fallback.data ?? []) as unknown as InboxTaskRow[]).map(withRescheduleDefaults) };
}

// Per-user inbox: every task assigned to a teammate row whose user_id is the
// current user, across every team the user belongs to. No teamId scoping —
// the inbox is the user's own view, joined via teammates.
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  // 1) Find teammate rows belonging to this user (one per team they're in).
  const { data: teammates, error: tmErr } = await supabase
    .from('teammates')
    .select('id, team_id, display_name, status')
    .eq('user_id', userId)
    .neq('status', 'retired');
  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });

  const teammateIds = (teammates ?? []).map((t) => t.id);
  if (teammateIds.length === 0) {
    return NextResponse.json({ tasks: [], counts: { open: 0, awaitingReview: 0 } });
  }

  // 2) Tasks assigned to any of those teammate rows that aren't terminal.
  const { tasks, error: taskError } = await fetchInboxTasks(teammateIds);
  if (taskError) return NextResponse.json({ error: taskError }, { status: 500 });
  const actionTasks = tasks.filter((t) => !isInsightOnlySourceRef(t.source_ref));

  // 3) Decorate with team name for inbox display.
  const teamIds = Array.from(new Set(actionTasks.map((t) => t.team_id)));
  const teamsRes =
    teamIds.length > 0
      ? await supabase.from('teams').select('id, name').in('id', teamIds)
      : { data: [], error: null };
  const teamNameById = new Map<string, string>();
  (teamsRes.data ?? []).forEach((t) => teamNameById.set(t.id as string, t.name as string));

  const open = actionTasks.filter((t) => t.status !== 'awaiting_review').length;
  const awaitingReview = actionTasks.filter((t) => t.status === 'awaiting_review').length;

  // Self-heal: kick verification for any task stuck mid-flight with no live
  // stage. Covers `auto_running` (Mark done flow) and `proof_evaluating` (after
  // teammate submitted proof). Both paths queue a job whose drain depends on
  // the daily cron — without this kick, the worker never runs in dev and
  // takes up to 24 h in prod. Fire-and-forget; the worker is idempotent.
  const stuck = actionTasks.filter((t) => {
    const vs = t.verification_status as string | null;
    if (vs !== 'auto_running' && vs !== 'proof_evaluating') return false;
    const ev = t.verification_evidence as { stage?: string } | null;
    return !ev?.stage;
  });
  for (const s of stuck) {
    const mode: 'auto' | 'proof_evaluation' =
      (s.verification_status as string) === 'proof_evaluating' ? 'proof_evaluation' : 'auto';
    void runTaskVerification({ taskId: s.id as string, mode }).catch((err) => {
      logger.warn('inbox: self-heal verification failed', {
        taskId: s.id,
        mode,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return NextResponse.json({
    tasks: actionTasks.map((t) => ({
      ...t,
      teamName: teamNameById.get(t.team_id as string) ?? 'Team',
    })),
    counts: { open, awaitingReview },
  });
}
