// Recgon storage — CRUD against the new tables introduced by
// supabase/migrations/20260426_recgon_admin.sql. Mirrors the pattern in
// src/lib/teamStorage.ts: thin wrappers around the service-role Supabase
// client with snake_case ↔ camelCase mapping.

import { supabase } from '../supabase';
import { stripMd } from '../strings';
import { logger } from '../logger';
import { AssignmentReasoningSchema } from '../schemas';
// Phase 4 Plan 03 — invalidate + re-enqueue reframe on reassignment.
// Imported from the leaf `reframeEnqueue` module (NOT `reframe.ts` or
// `dispatcher.ts`) to avoid an import cycle. Storage is upstream of both
// reframe and dispatcher; this single leaf is the only file storage
// transitively depends on for queue plumbing.
import { enqueueReframeJob } from './reframeEnqueue';
import type {
  Teammate,
  TeammateWithStats,
  TeammateStatus,
  WorkingHours,
  FitProfile,
  AgentTask,
  TaskKind,
  TaskSource,
  TaskStatus,
  TaskRating,
  RecgonState,
  AssignmentLogEntry,
  AssignmentReasoning,
  BrainSnapshot,
  ProofPayload,
  VerificationStatus,
  VerificationEvidence,
  RescheduleRequestStatus,
  TriageNote,
  OverdueSweepCounts,
} from './types';

// Keep the assignment log bounded so the row doesn't grow unbounded.
const ASSIGNMENT_LOG_MAX = 50;

type TeammateRow = {
  id: string;
  team_id: string;
  user_id: string | null;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  title: string | null;
  skills: string[] | null;
  capacity_hours: number;
  working_hours: WorkingHours | null;
  fit_profile: FitProfile | null;
  status: TeammateStatus;
  created_at: string;
};

function mapTeammate(row: TeammateRow): Teammate {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    title: row.title,
    skills: row.skills ?? [],
    capacityHours: Number(row.capacity_hours),
    workingHours: row.working_hours,
    fitProfile: row.fit_profile ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

// Exported so issueStorage.listTasksForIssue can reuse the canonical
// row→AgentTask mapper instead of reimplementing it (quick-260626-mkn).
export type TaskRow = {
  id: string;
  team_id: string;
  project_id: string | null;
  title: string;
  description: string;
  kind: TaskKind;
  source: TaskSource;
  source_ref: Record<string, unknown> | null;
  required_skills: string[] | null;
  priority: number;
  estimated_hours: number;
  deadline: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  status: TaskStatus;
  job_id: string | null;
  result: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  proof: ProofPayload | null;
  verification_status: VerificationStatus | null;
  verification_evidence: VerificationEvidence | null;
  verified_at: string | null;
  verified_by: string | null;
  scheduled_date: string | null;
  scheduled_until_date: string | null;
  schedule_note: string | null;
  reschedule_request_status: RescheduleRequestStatus | null;
  reschedule_requested_at: string | null;
  reschedule_requested_by: string | null;
  reschedule_request_note: string | null;
  reschedule_requested_date: string | null;
  // Phase 3 / Plan 03 — populated by assignTask after a dispatch decision.
  // null on pre-Phase-3 rows and on legacy manual reassignments that don't
  // pass reasoning. Shape validated by AssignmentReasoningSchema.
  assignment_reasoning: AssignmentReasoning | null;
  // Phase 3 / Plan 06 — refusal note when the dispatcher cannot assign.
  // Nullable; null for assigned/deferred rows and pre-Plan-06 rows.
  triage_note: TriageNote | null;
  // Phase 3.6 / Plan 01 — overdue-tier book-keeping. `overdue_tier` is the
  // last tier the cron actioned (0=none, 1=nudged, 2=escalated,
  // 3=auto-rescheduled). `last_overdue_action_at` drives the 24h cool-down.
  overdue_tier?: number | null;
  last_overdue_action_at?: string | null;
  // Phase 4 / Plan 01 — personalized framing columns (additive migration).
  // The task_reframe worker writes both atomically; the API route at
  // `/api/recgon/tasks/[id]` reads them server-side and serves the
  // personalized text ONLY when the viewer is the assignee whose userId
  // matches `personalized_description_for_user_id` (Plan 04-02).
  // The RAW columns NEVER cross the API boundary — they are stripped from
  // the response payload (destructure + overwrite, not spread).
  personalized_description?: string | null;
  personalized_description_for_user_id?: string | null;
  // quick-260620-mav — LLM-written compact-UI label (calendar chip + command
  // rows). Patched AFTER insert (createTask never sets it) by
  // setTaskShortSummary once the batched summary is generated. NULL on
  // pre-migration rows / LLM failure / before generation.
  short_summary?: string | null;
};

export function mapTask(row: TaskRow): AgentTask {
  return {
    id: row.id,
    teamId: row.team_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? '',
    kind: row.kind,
    source: row.source,
    sourceRef: row.source_ref ?? {},
    requiredSkills: row.required_skills ?? [],
    priority: row.priority,
    estimatedHours: Number(row.estimated_hours),
    deadline: row.deadline,
    assignedTo: row.assigned_to,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    status: row.status,
    jobId: row.job_id,
    result: row.result,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    proof: row.proof ?? null,
    verificationStatus: row.verification_status ?? 'none',
    verificationEvidence: row.verification_evidence ?? null,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    scheduledDate: row.scheduled_date,
    scheduledUntilDate: row.scheduled_until_date,
    scheduleNote: row.schedule_note,
    rescheduleRequestStatus: row.reschedule_request_status ?? 'none',
    rescheduleRequestedAt: row.reschedule_requested_at ?? null,
    rescheduleRequestedBy: row.reschedule_requested_by ?? null,
    rescheduleRequestNote: row.reschedule_request_note ?? null,
    rescheduleRequestedDate: row.reschedule_requested_date ?? null,
    // Phase 3 / Plan 03 — JSONB envelope; null on pre-Phase-3 rows.
    // API routes NEVER return this raw blob to clients (privacy boundary,
    // T-03-03-03) — they convert to whyYouSentence via renderWhyYou first.
    assignmentReasoning: row.assignment_reasoning ?? null,
    // Phase 3 / Plan 06 — refusal explanation; null for assigned/deferred
    // tasks and pre-Plan-06 rows.
    triageNote: row.triage_note ?? null,
    // Phase 3.6 / Plan 04 — surface the overdue book-keeping fields on the
    // canonical AgentTask so the UI (chip + tier badge) can read them
    // without a separate query. Row schema has `overdue_tier int default 0`
    // and `last_overdue_action_at timestamptz` (Plan 01 migration).
    // Both default to null on pre-migration test fixtures; the UI treats
    // null `overdueTier` as 0.
    overdueTier: ((row.overdue_tier ?? 0) as 0 | 1 | 2 | 3),
    lastOverdueActionAt: row.last_overdue_action_at ?? null,
    // Phase 4 / Plan 01 columns → camelCase fields on AgentTask. The route
    // at /api/recgon/tasks/[id] consumes these to viewer-discriminate the
    // description (Plan 04-02); they MUST NEVER appear on a response payload.
    personalizedDescription: row.personalized_description ?? null,
    personalizedDescriptionForUserId: row.personalized_description_for_user_id ?? null,
    // quick-260620-mav — compact-UI label. NULL until generated; the display
    // helper (taskDisplayTitle) falls back to the full clean title.
    shortSummary: row.short_summary ?? null,
  };
}

function isInsightOnlySourceRef(ref: Record<string, unknown> | null | undefined): boolean {
  return ref?.kind === 'top_risk';
}

export function isAssignableTask(task: Pick<AgentTask, 'sourceRef'>): boolean {
  return !isInsightOnlySourceRef(task.sourceRef);
}

function isAssignableTaskRow(row: TaskRow): boolean {
  return !isInsightOnlySourceRef(row.source_ref);
}

// ── Teammates ───────────────────────────────────────────────────────────────

export type TeammateInsert = {
  teamId: string;
  userId?: string | null;
  displayName: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  skills?: string[];
  capacityHours?: number;
  workingHours?: WorkingHours | null;
};

export async function createTeammate(input: TeammateInsert): Promise<Teammate> {
  const { data, error } = await supabase
    .from('teammates')
    .insert({
      team_id: input.teamId,
      kind: 'human',
      user_id: input.userId ?? null,
      display_name: input.displayName,
      avatar_color: input.avatarColor ?? null,
      avatar_url: input.avatarUrl ?? null,
      title: input.title ?? null,
      skills: input.skills ?? [],
      capacity_hours: input.capacityHours ?? 10,
      working_hours: input.workingHours ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createTeammate failed: ${error?.message}`);
  return mapTeammate(data as TeammateRow);
}

export async function listTeammates(teamId: string): Promise<Teammate[]> {
  const { data, error } = await supabase
    .from('teammates')
    .select('*')
    .eq('team_id', teamId)
    .neq('status', 'retired')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listTeammates failed: ${error.message}`);
  return (data ?? []).map((r) => mapTeammate(r as TeammateRow));
}

export async function listTeammatesWithStats(teamId: string): Promise<TeammateWithStats[]> {
  const teammates = await listTeammates(teamId);
  if (teammates.length === 0) return [];
  const ids = teammates.map((t) => t.id);
  const userIds = teammates.map((t) => t.userId).filter((u): u is string => !!u);

  // Look up all teammate IDs for these users across every team they belong to,
  // so in-flight hours from other teams count toward load headroom.
  const [statsRes, rolesRes, allTmRes] = await Promise.all([
    supabase.from('teammate_stats').select('*').in('teammate_id', ids),
    userIds.length
      ? supabase.from('team_members').select('user_id, role').eq('team_id', teamId).in('user_id', userIds)
      : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
    userIds.length
      ? supabase.from('teammates').select('id, user_id').in('user_id', userIds).neq('status', 'retired')
      : Promise.resolve({ data: [] as { id: string; user_id: string | null }[] }),
  ]);

  const userByAllTmId = new Map<string, string>(); // any-team teammate id → userId
  (allTmRes.data ?? []).forEach((r) => {
    if (r.user_id) userByAllTmId.set(r.id, r.user_id);
  });
  const allTmIds = userByAllTmId.size > 0 ? [...userByAllTmId.keys()] : ids;

  const inFlightRes = await supabase
    .from('agent_tasks')
    .select('assigned_to, estimated_hours, source_ref')
    .in('assigned_to', allTmIds)
    .in('status', ['assigned', 'accepted', 'in_progress', 'awaiting_review']);

  const byId = new Map<string, Record<string, unknown>>();
  (statsRes.data ?? []).forEach((s) => byId.set(s.teammate_id as string, s as Record<string, unknown>));
  const roleByUser = new Map<string, 'owner' | 'member' | 'viewer'>();
  (rolesRes.data ?? []).forEach((r) => {
    const role = r.role as string;
    if (role === 'owner' || role === 'member' || role === 'viewer') {
      roleByUser.set(r.user_id as string, role);
    }
  });

  // Aggregate hours by userId (merges cross-team load); fall back to teammate ID for AI/anon
  const hoursByUserId = new Map<string, number>();
  const hoursByTmId = new Map<string, number>();
  ((inFlightRes.data ?? []) as { assigned_to: string | null; estimated_hours: number | null; source_ref: Record<string, unknown> | null }[])
    .filter((row) => !isInsightOnlySourceRef(row.source_ref))
    .forEach((row) => {
      if (!row.assigned_to) return;
      const uid = userByAllTmId.get(row.assigned_to);
      if (uid) {
        hoursByUserId.set(uid, (hoursByUserId.get(uid) ?? 0) + (Number(row.estimated_hours) || 0));
      } else {
        hoursByTmId.set(row.assigned_to, (hoursByTmId.get(row.assigned_to) ?? 0) + (Number(row.estimated_hours) || 0));
      }
    });

  return teammates.map((t) => {
    const s = byId.get(t.id);
    const inFlightHours = t.userId
      ? (hoursByUserId.get(t.userId) ?? 0)
      : (hoursByTmId.get(t.id) ?? 0);
    return {
      ...t,
      stars: s ? Number(s.stars) : 3.5,
      ratingCount: s ? Number(s.rating_count) : 0,
      upCount: s ? Number(s.up_count) : 0,
      downCount: s ? Number(s.down_count) : 0,
      inFlightCount: s ? Number(s.in_flight_count) : 0,
      inFlightHours,
      teamRole: t.userId ? roleByUser.get(t.userId) ?? null : null,
    };
  });
}

export async function getTeammate(teammateId: string): Promise<Teammate | null> {
  const { data } = await supabase
    .from('teammates')
    .select('*')
    .eq('id', teammateId)
    .maybeSingle();
  return data ? mapTeammate(data as TeammateRow) : null;
}

export async function updateTeammate(
  teammateId: string,
  fields: Partial<TeammateInsert> & { status?: TeammateStatus; fitProfile?: FitProfile }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.displayName !== undefined) update.display_name = fields.displayName;
  if (fields.avatarColor !== undefined) update.avatar_color = fields.avatarColor;
  if (fields.avatarUrl !== undefined) update.avatar_url = fields.avatarUrl;
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.skills !== undefined) update.skills = fields.skills;
  if (fields.capacityHours !== undefined) update.capacity_hours = fields.capacityHours;
  if (fields.workingHours !== undefined) update.working_hours = fields.workingHours;
  if (fields.status !== undefined) update.status = fields.status;
  if (fields.fitProfile !== undefined) update.fit_profile = fields.fitProfile;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('teammates').update(update).eq('id', teammateId);
  if (error) throw new Error(`updateTeammate failed: ${error.message}`);
}

export async function retireTeammate(teammateId: string): Promise<void> {
  await updateTeammate(teammateId, { status: 'retired' });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskInsert = {
  teamId: string;
  projectId?: string | null;
  title: string;
  description?: string;
  kind: TaskKind;
  source: TaskSource;
  sourceRef?: Record<string, unknown>;
  requiredSkills?: string[];
  priority?: number;
  estimatedHours?: number;
  deadline?: string | null;
  createdBy?: string | null;
};

export async function createTask(input: TaskInsert): Promise<AgentTask | null> {
  if (isInsightOnlySourceRef(input.sourceRef)) return null;
  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      team_id: input.teamId,
      project_id: input.projectId ?? null,
      title: stripMd(input.title),
      description: stripMd(input.description ?? ''),
      kind: input.kind,
      source: input.source,
      source_ref: input.sourceRef ?? {},
      required_skills: input.requiredSkills ?? [],
      priority: input.priority ?? 2,
      estimated_hours: input.estimatedHours ?? 1,
      deadline: input.deadline ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) {
    // Unique violation on dedupKey is expected — caller treats null as "already minted".
    if (error.code === '23505') return null;
    throw new Error(`createTask failed: ${error.message}`);
  }
  return data ? mapTask(data as TaskRow) : null;
}

// quick-260620-mav — fail-soft writer for the compact-UI label. Called by the
// two creation paths (brain mint + manual create) AFTER the batched summary is
// generated, so the column is patched onto an already-persisted row.
//
// CRITICAL: this NEVER throws. A failure to store the summary (column missing
// pre-migration, transient Supabase error, etc.) must not bubble into — and
// therefore must not fail — task creation. On any error we logger.warn and
// return; the row simply keeps short_summary = NULL and the UI falls back to
// the full title.
export async function setTaskShortSummary(taskId: string, summary: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('agent_tasks')
      .update({ short_summary: stripMd(summary) })
      .eq('id', taskId);
    if (error) {
      logger.warn('setTaskShortSummary update failed (non-fatal)', {
        taskId,
        err: error.message,
      });
    }
  } catch (err) {
    logger.warn('setTaskShortSummary threw (non-fatal)', {
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listTasks(
  teamId: string,
  filters?: { status?: TaskStatus | TaskStatus[]; teammateId?: string; kind?: TaskKind; projectId?: string },
): Promise<AgentTask[]> {
  let q = supabase.from('agent_tasks').select('*').eq('team_id', teamId);
  if (filters?.status) {
    if (Array.isArray(filters.status)) q = q.in('status', filters.status);
    else q = q.eq('status', filters.status);
  }
  if (filters?.teammateId) q = q.eq('assigned_to', filters.teammateId);
  if (filters?.kind) q = q.eq('kind', filters.kind);
  if (filters?.projectId) q = q.eq('project_id', filters.projectId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(`listTasks failed: ${error.message}`);
  return (data ?? [])
    .filter((r) => isAssignableTaskRow(r as TaskRow))
    .map((r) => mapTask(r as TaskRow));
}

export async function listUnassignedTasks(teamId: string): Promise<AgentTask[]> {
  return listTasks(teamId, { status: 'unassigned' });
}

const ACTIVE_TASK_STATUSES_FOR_LOAD: TaskStatus[] = [
  'assigned',
  'accepted',
  'in_progress',
  'awaiting_review',
];

type ScheduleLoadRow = {
  id: string;
  scheduled_date: string | null;
  scheduled_until_date: string | null;
  estimated_hours: number | null;
  source_ref: Record<string, unknown> | null;
};

// A multi-day task spreads its estimated hours evenly across the days it
// occupies. For load accounting we count each day's share so a 6h task across
// 3 days contributes 2h to each day, not 6h to the start.
function accumulateLoad(
  rows: ScheduleLoadRow[],
  fromDate: string,
  toDate: string,
  out: Record<string, number>,
  excludeTaskId?: string,
): void {
  for (const row of rows) {
    if (!row.scheduled_date) continue;
    if (excludeTaskId && row.id === excludeTaskId) continue;
    if (isInsightOnlySourceRef(row.source_ref)) continue;
    const totalHours = Number(row.estimated_hours) || 0;
    const start = row.scheduled_date;
    const end = row.scheduled_until_date && row.scheduled_until_date >= start
      ? row.scheduled_until_date
      : start;
    const days: string[] = [];
    let cursor = new Date(`${start}T00:00:00Z`);
    const endCursor = new Date(`${end}T00:00:00Z`);
    while (cursor.getTime() <= endCursor.getTime()) {
      const key = cursor.toISOString().slice(0, 10);
      if (key >= fromDate && key <= toDate) days.push(key);
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    if (days.length === 0) continue;
    const perDay = totalHours / days.length;
    for (const d of days) out[d] = (out[d] ?? 0) + perDay;
  }
}

// Sum already-scheduled estimated hours by scheduled_date for active tasks.
// Used by the dispatcher to avoid overloading a teammate on a single day.
// `excludeTaskId` lets the caller skip the task being (re)scheduled.
export async function loadHoursByDateForTeammate(
  teammateId: string,
  fromDate: string,
  toDate: string,
  excludeTaskId?: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('id, scheduled_date, scheduled_until_date, estimated_hours, source_ref')
    .eq('assigned_to', teammateId)
    .in('status', ACTIVE_TASK_STATUSES_FOR_LOAD)
    .lte('scheduled_date', toDate);
  if (error) throw new Error(`loadHoursByDateForTeammate failed: ${error.message}`);
  const out: Record<string, number> = {};
  accumulateLoad((data ?? []) as ScheduleLoadRow[], fromDate, toDate, out, excludeTaskId);
  return out;
}

// Cross-team variant: aggregate load across every team this user belongs to.
// Used for human teammates so a task on team A counts toward their day's load
// when team B's dispatcher tries to schedule them.
export async function loadHoursByDateForUser(
  userId: string,
  fromDate: string,
  toDate: string,
  excludeTaskId?: string,
): Promise<Record<string, number>> {
  const { data: tmRows } = await supabase
    .from('teammates')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'retired');
  const ids = (tmRows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('id, scheduled_date, scheduled_until_date, estimated_hours, source_ref')
    .in('assigned_to', ids)
    .in('status', ACTIVE_TASK_STATUSES_FOR_LOAD)
    .lte('scheduled_date', toDate);
  if (error) throw new Error(`loadHoursByDateForUser failed: ${error.message}`);
  const out: Record<string, number> = {};
  accumulateLoad((data ?? []) as ScheduleLoadRow[], fromDate, toDate, out, excludeTaskId);
  return out;
}

// Personal calendar query: every scheduled task assigned to a teammate row
// whose user_id is the given user, across every team they belong to. Filters
// by overlap with [fromDate, toDate] so multi-day tasks that cross the window
// still appear. Terminal statuses are excluded so the calendar shows live
// commitments only.
export async function listScheduledTasksForUser(
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<AgentTask[]> {
  const { data: tmRows } = await supabase
    .from('teammates')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'retired');
  const ids = (tmRows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .in('assigned_to', ids)
    .in('status', ['assigned', 'accepted', 'in_progress', 'awaiting_review', 'completed'])
    .not('scheduled_date', 'is', null)
    .lte('scheduled_date', toDate);
  if (error) throw new Error(`listScheduledTasksForUser failed: ${error.message}`);
  const rows = (data ?? []) as TaskRow[];
  return rows
    .filter((row) => isAssignableTaskRow(row))
    .filter((row) => {
      const start = row.scheduled_date!;
      const end = row.scheduled_until_date && row.scheduled_until_date >= start
        ? row.scheduled_until_date
        : start;
      return end >= fromDate;
    })
    .map(mapTask);
}

export async function getTask(taskId: string): Promise<AgentTask | null> {
  const { data } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  if (!data) return null;
  const row = data as TaskRow;
  return isAssignableTaskRow(row) ? mapTask(row) : null;
}

export async function assignTask(
  taskId: string,
  teammateId: string,
  assignedBy: 'recgon' | string,
  jobId?: string | null,
  schedule?: {
    scheduledDate?: string | null;
    scheduledUntilDate?: string | null;
    deadline?: string | null;
    scheduleNote?: string | null;
  },
  reasoning?: AssignmentReasoning,
): Promise<void> {
  const update: Record<string, unknown> = {
    assigned_to: teammateId,
    assigned_by: assignedBy,
    assigned_at: new Date().toISOString(),
    status: 'assigned',
    job_id: jobId ?? null,
  };
  if (schedule?.scheduledDate !== undefined) update.scheduled_date = schedule.scheduledDate;
  if (schedule?.scheduledUntilDate !== undefined) update.scheduled_until_date = schedule.scheduledUntilDate;
  if (schedule?.deadline !== undefined) update.deadline = schedule.deadline;
  if (schedule?.scheduleNote !== undefined) update.schedule_note = schedule.scheduleNote;
  // Phase 3 / Plan 03 — persist the "Why you" reasoning envelope.
  // Validated against AssignmentReasoningSchema before write; on parse
  // failure we log + write null. The assignment itself proceeds either
  // way — reasoning is auditing copy, not the source-of-truth assignment.
  if (reasoning !== undefined) {
    const parsed = AssignmentReasoningSchema.safeParse(reasoning);
    if (parsed.success) {
      update.assignment_reasoning = parsed.data;
    } else {
      logger.warn('invalid_assignment_reasoning', {
        taskId,
        err: parsed.error.message,
      });
      update.assignment_reasoning = null;
    }
  }
  const { error } = await supabase
    .from('agent_tasks')
    .update(update)
    .eq('id', taskId);
  if (error) throw new Error(`assignTask failed: ${error.message}`);
}

export async function setTaskSchedule(
  taskId: string,
  schedule: {
    scheduledDate?: string | null;
    scheduledUntilDate?: string | null;
    deadline?: string | null;
    scheduleNote?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (schedule.scheduledDate !== undefined) update.scheduled_date = schedule.scheduledDate;
  if (schedule.scheduledUntilDate !== undefined) update.scheduled_until_date = schedule.scheduledUntilDate;
  if (schedule.deadline !== undefined) update.deadline = schedule.deadline;
  if (schedule.scheduleNote !== undefined) update.schedule_note = schedule.scheduleNote;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`setTaskSchedule failed: ${error.message}`);
}

// ── Phase 3 / Plan 06 — triage + deferral helpers ──────────────────────────

/**
 * Mark a task as triaged (cannot be auto-assigned). The task stays
 * `status='unassigned'` and the owner triages manually via the Plan 03-07
 * TASKS-page view. Idempotent: writing the same note is a no-op overwrite.
 *
 * Also clears `assigned_to` defensively in case a prior assignment cycle
 * partially wrote that field before deciding to triage.
 */
export async function markTaskForTriage(
  taskId: string,
  note: TriageNote,
): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({
      triage_note: note,
      assigned_to: null,
      status: 'unassigned',
    })
    .eq('id', taskId);
  if (error) throw new Error(`markTaskForTriage failed: ${error.message}`);
}

/**
 * Defer a task to a future scheduledDate. Used by the dispatcher when
 * qualified candidates exist but all are booked NOW and the task is not
 * high-priority. The task stays `status='unassigned'` with
 * `triage_note=null` so the NEXT dispatch run on the new scheduledDate
 * picks it up cleanly. The deferral reason rides on `schedule_note` so
 * the owner can see why this task's schedule moved without having to look
 * at `triage_note`.
 *
 * Idempotent: writing the same date is a no-op overwrite.
 */
export async function deferTaskScheduledDate(
  taskId: string,
  newDate: Date,
): Promise<void> {
  const iso = newDate.toISOString().slice(0, 10);
  const { error } = await supabase
    .from('agent_tasks')
    .update({
      scheduled_date: iso,
      schedule_note: `Deferred — qualified candidates booked, retrying ${iso}`,
      status: 'unassigned',
      triage_note: null,
    })
    .eq('id', taskId);
  if (error) throw new Error(`deferTaskScheduledDate failed: ${error.message}`);
}

/**
 * Clear a task's triage note. Used by the successful-assignment path so
 * previously-triaged tasks reflect the new state cleanly (next dispatch
 * doesn't see a stale `no_clear_fit` next to an actually-assigned row).
 */
export async function clearTriageNote(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({ triage_note: null })
    .eq('id', taskId);
  if (error) throw new Error(`clearTriageNote failed: ${error.message}`);
}

export async function requestTaskReschedule(
  taskId: string,
  request: {
    requestedBy: string;
    note?: string | null;
    requestedDate?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({
      reschedule_request_status: 'pending',
      reschedule_requested_at: new Date().toISOString(),
      reschedule_requested_by: request.requestedBy,
      reschedule_request_note: request.note?.trim() || null,
      reschedule_requested_date: request.requestedDate ?? null,
    })
    .eq('id', taskId);
  if (error) throw new Error(`requestTaskReschedule failed: ${error.message}`);
}

export async function setTaskRescheduleRequestStatus(
  taskId: string,
  status: RescheduleRequestStatus,
): Promise<void> {
  const update: Record<string, unknown> = {
    reschedule_request_status: status,
  };
  if (status === 'none') {
    update.reschedule_requested_at = null;
    update.reschedule_requested_by = null;
    update.reschedule_request_note = null;
    update.reschedule_requested_date = null;
  }
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`setTaskRescheduleRequestStatus failed: ${error.message}`);
}

// Task edit (Phase C) — owner/creator changes to title, description,
// priority, deadline. A description change invalidates the personalized
// text in the SAME update statement (it was grounded in the old wording —
// FRAME-04 spirit); the caller re-enqueues a reframe for the assignee.
export async function updateTaskDetails(
  taskId: string,
  fields: {
    title?: string;
    description?: string;
    priority?: number;
    deadline?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.description !== undefined) {
    update.description = fields.description;
    update.personalized_description = null;
    update.personalized_description_for_user_id = null;
  }
  if (fields.priority !== undefined) update.priority = fields.priority;
  if (fields.deadline !== undefined) update.deadline = fields.deadline;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`updateTaskDetails failed: ${error.message}`);
}

export async function updateTaskRequiredSkills(
  taskId: string,
  skills: string[],
): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({ required_skills: skills })
    .eq('id', taskId);
  if (error) throw new Error(`updateTaskRequiredSkills failed: ${error.message}`);
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  fields?: { result?: Record<string, unknown>; jobId?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (fields?.result !== undefined) update.result = fields.result;
  if (fields?.jobId !== undefined) update.job_id = fields.jobId;
  if (status === 'completed') update.completed_at = new Date().toISOString();
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`updateTaskStatus failed: ${error.message}`);
}

export async function reassignTask(
  taskId: string,
  teammateId: string | null,
  assignedBy: 'recgon' | string,
  schedule?: {
    scheduledDate?: string | null;
    scheduledUntilDate?: string | null;
    deadline?: string | null;
    scheduleNote?: string | null;
  },
): Promise<void> {
  // Phase 4 / Plan 03 — read current state to detect an ACTUAL reassignment
  // vs a no-op call. The personalized columns must NOT be invalidated when
  // someone calls reassignTask(taskId, sameTeammate) — that's idempotent.
  // We also need teamId for the reframe enqueue payload.
  const { data: current } = await supabase
    .from('agent_tasks')
    .select('assigned_to, team_id')
    .eq('id', taskId)
    .maybeSingle();
  const previousAssignedTo = (current?.assigned_to as string | null) ?? null;
  const teamId = (current?.team_id as string | undefined) ?? '';
  const isActualReassignment =
    previousAssignedTo !== teammateId &&
    (previousAssignedTo !== null || teammateId !== null);

  const update: Record<string, unknown> = {
    assigned_to: teammateId,
    assigned_by: assignedBy,
    assigned_at: teammateId ? new Date().toISOString() : null,
    status: teammateId ? 'assigned' : 'unassigned',
    job_id: null,
  };
  if (!teammateId) {
    update.scheduled_date = null;
    update.scheduled_until_date = null;
    update.schedule_note = null;
  }
  if (schedule?.scheduledDate !== undefined) update.scheduled_date = schedule.scheduledDate;
  if (schedule?.scheduledUntilDate !== undefined) update.scheduled_until_date = schedule.scheduledUntilDate;
  if (schedule?.deadline !== undefined) update.deadline = schedule.deadline;
  if (schedule?.scheduleNote !== undefined) update.schedule_note = schedule.scheduleNote;

  // Phase 4 / Plan 03 — FRAME-04 atomic invalidation of personalized columns
  // on actual reassignment. The new assignee must NEVER see text written for
  // the previous assignee — not even for a single cron-cycle gap. Performed
  // in the SAME supabase update statement as the `assigned_to` change so
  // there is no window where the row carries both the new assignee AND the
  // stale personalized text.
  if (isActualReassignment) {
    update.personalized_description = null;
    update.personalized_description_for_user_id = null;
  }

  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`reassignTask failed: ${error.message}`);

  // Phase 4 / Plan 03 — fire-and-forget reframe enqueue for the new assignee.
  // Skipped when:
  //   - No actual reassignment (idempotent no-op).
  //   - teammateId is null (decline/unassign — no one to personalize for).
  //
  // `enqueueReframeJob` already catches its own errors internally, so this
  // outer `.catch` is defense-in-depth: even if the helper itself were to
  // throw (e.g. an unexpected upstream module-load failure under test or a
  // refactor regression), reassignment success MUST be independent of queue
  // health. The reassignment is the source of truth; the reframe is
  // enhancement.
  if (isActualReassignment && teammateId !== null) {
    await enqueueReframeJob(taskId, teammateId, teamId).catch((err) => {
      logger.warn('task_reframe enqueue helper threw (unexpected)', {
        taskId,
        teammateId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  // Tombstone brain-sourced dedupKeys before deleting so the next dispatch
  // doesn't re-mint the same row from the same analysis.
  const { data: row } = await supabase
    .from('agent_tasks')
    .select('team_id, kind, source, source_ref')
    .eq('id', taskId)
    .maybeSingle();
  if (row) {
    const sourceRef = row.source_ref as Record<string, unknown> | null;
    const dedupKey = sourceRef && typeof sourceRef.dedupKey === 'string' ? sourceRef.dedupKey : null;
    if (row.source === 'brain' && dedupKey) {
      await supabase
        .from('agent_task_tombstones')
        .upsert(
          { team_id: row.team_id, kind: row.kind, dedup_key: dedupKey },
          { onConflict: 'team_id,kind,dedup_key' },
        );
    }
  }
  const { error } = await supabase.from('agent_tasks').delete().eq('id', taskId);
  if (error) throw new Error(`deleteTask failed: ${error.message}`);
}

export async function listTombstonedDedupKeys(teamId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('agent_task_tombstones')
    .select('kind, dedup_key')
    .eq('team_id', teamId);
  if (error) throw new Error(`listTombstonedDedupKeys failed: ${error.message}`);
  return new Set((data ?? []).map((r) => `${r.kind}::${r.dedup_key}`));
}

// ── Verification ────────────────────────────────────────────────────────────

export async function setTaskProof(taskId: string, proof: ProofPayload): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({ proof })
    .eq('id', taskId);
  if (error) throw new Error(`setTaskProof failed: ${error.message}`);
}

export async function setTaskVerification(
  taskId: string,
  fields: {
    verificationStatus?: VerificationStatus;
    verificationEvidence?: VerificationEvidence | null;
    verifiedAt?: string | null;
    verifiedBy?: string | null;
    status?: TaskStatus;
    jobId?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.verificationStatus !== undefined) update.verification_status = fields.verificationStatus;
  if (fields.verificationEvidence !== undefined) update.verification_evidence = fields.verificationEvidence;
  if (fields.verifiedAt !== undefined) update.verified_at = fields.verifiedAt;
  if (fields.verifiedBy !== undefined) update.verified_by = fields.verifiedBy;
  if (fields.status !== undefined) {
    update.status = fields.status;
    if (fields.status === 'completed') update.completed_at = new Date().toISOString();
  }
  if (fields.jobId !== undefined) update.job_id = fields.jobId;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`setTaskVerification failed: ${error.message}`);
}

// ── Ratings ─────────────────────────────────────────────────────────────────

export async function upsertRating(input: {
  taskId: string;
  teammateId: string;
  rating: 1 | -1;
  note?: string;
  ratedBy: string;
}): Promise<TaskRating> {
  const { data, error } = await supabase
    .from('agent_task_ratings')
    .upsert(
      {
        task_id: input.taskId,
        teammate_id: input.teammateId,
        rating: input.rating,
        note: input.note ?? null,
        rated_by: input.ratedBy,
        rated_at: new Date().toISOString(),
      },
      { onConflict: 'task_id' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`upsertRating failed: ${error?.message}`);
  return {
    taskId: data.task_id,
    teammateId: data.teammate_id,
    rating: data.rating,
    note: data.note ?? undefined,
    ratedBy: data.rated_by,
    ratedAt: data.rated_at,
  };
}

export async function getRating(taskId: string): Promise<TaskRating | null> {
  const { data } = await supabase
    .from('agent_task_ratings')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();
  if (!data) return null;
  return {
    taskId: data.task_id,
    teammateId: data.teammate_id,
    rating: data.rating,
    note: data.note ?? undefined,
    ratedBy: data.rated_by,
    ratedAt: data.rated_at,
  };
}

// ── Recgon state ────────────────────────────────────────────────────────────

export async function getRecgonState(teamId: string): Promise<RecgonState> {
  const { data } = await supabase
    .from('recgon_state')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();
  if (!data) {
    // Defensive: seed if missing (e.g. team created before migration backfill).
    await supabase.from('recgon_state').insert({ team_id: teamId }).single();
    return {
      teamId,
      brainSnapshot: null,
      lastDispatchAt: null,
      assignmentLog: [],
    };
  }
  // The migration defaults brain_snapshot to '{}'::jsonb so the row is never
  // null — but an unpopulated snapshot has no `totalEntries`. Treat that as
  // "no snapshot yet" so callers (UI) can handle it cleanly.
  const rawSnapshot = data.brain_snapshot as Partial<BrainSnapshot> | null;
  const brainSnapshot: BrainSnapshot | null =
    rawSnapshot && typeof rawSnapshot.totalEntries === 'number'
      ? (rawSnapshot as BrainSnapshot)
      : null;
  return {
    teamId: data.team_id,
    brainSnapshot,
    lastDispatchAt: data.last_dispatch_at,
    assignmentLog: (data.assignment_log as AssignmentLogEntry[] | null) ?? [],
  };
}

export async function saveBrainSnapshot(teamId: string, snapshot: BrainSnapshot): Promise<void> {
  await supabase
    .from('recgon_state')
    .upsert({ team_id: teamId, brain_snapshot: snapshot, updated_at: new Date().toISOString() });
}

export async function appendAssignmentLog(
  teamId: string,
  entry: AssignmentLogEntry,
): Promise<void> {
  const state = await getRecgonState(teamId);
  const next = [entry, ...state.assignmentLog].slice(0, ASSIGNMENT_LOG_MAX);
  await supabase
    .from('recgon_state')
    .update({
      assignment_log: next,
      last_dispatch_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('team_id', teamId);
}

// ── Event log ───────────────────────────────────────────────────────────────

export async function logEvent(input: {
  teamId: string;
  teammateId?: string | null;
  taskId?: string | null;
  event:
    | 'assigned'
    | 'accepted'
    | 'declined'
    | 'completed'
    | 'rated'
    | 'reassigned'
    | 'reschedule_requested'
    | 'rescheduled'
    | 'overloaded'
    | 'no_fit'
    // Phase 3 / Plan 06 — refusal/deferral events for owner observability.
    | 'triaged'
    | 'deferred'
    // Phase 3 / Plan 07 — owner override of a triaged task. Audits the
    // owner_user_id, assignee_id, and prior_triage_note for traceability.
    | 'manually_assigned'
    // Phase 3.6 / Plan 01 — graduated overdue-pressure events. Plan 03
    // writes these from the sweep cron (`/api/cron/overdue-sweep`).
    | 'nudged'
    | 'escalated'
    | 'auto_rescheduled'
    | 'snoozed'
    // Mission Control — owner denied a pending reschedule request from
    // the /command decision stack ('rescheduled' would lie: nothing moved).
    | 'reschedule_dismissed'
    // Task edit endpoint — owner/creator changed title/description/
    // priority/deadline after mint.
    | 'edited';
  payload?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('teammate_event_log').insert({
    team_id: input.teamId,
    teammate_id: input.teammateId ?? null,
    task_id: input.taskId ?? null,
    event: input.event,
    payload: input.payload ?? {},
  });
}

// ── Phase 3.6 / Plan 03 — Overdue task pressure (real implementation) ──────
//
// Plan 01 landed the walking-skeleton stub; Plan 02 landed the pure policy
// (`overduePolicy.ts`); Plan 03 (this code) wires them together and adds the
// side-effect helpers (`markOverdueAction`, `snoozeTask`) plus the
// `sweepOverdueTeams` iterator that the daily cron calls.
//
// Iterator shape:
//   1. Load every team with `overdue_pressure_enabled = true`.
//   2. Per team, load active-status tasks + teammates-with-stats + owner.
//   3. Per task, call the pure `decideOverdueAction`.
//   4. For non-`none` decisions, call `executeOverdueAction` (overdueRunner)
//      which sends the email and persists the storage update via the
//      `markOverdueAction` helper below.
//   5. Aggregate counts into the `actionsByKind` bucket and return.

import { decideOverdueAction, ACTIVE_OVERDUE_STATUSES } from './overduePolicy';
import type { OverdueTier } from './types';

/**
 * Persist the side effect of an overdue action atomically:
 *   - Bump `agent_tasks.overdue_tier` (1/2/3) and `last_overdue_action_at`
 *     (NOW) so the 24h cool-down kicks in for the next sweep.
 *   - Write a row to `teammate_event_log` describing what fired.
 *
 * `event` must match the just-promoted tier (1↔nudged, 2↔escalated,
 * 3↔auto_rescheduled). Callers in `overdueRunner.ts` pass this consistently;
 * the runtime accepts a mismatched pair (it's only a typing nicety) but the
 * audit trail will look weird, so don't.
 *
 * NOTE: we don't run this inside a Postgres transaction because Supabase
 * client-side transactions aren't available with the service-role REST
 * client. The two writes are independent rows on independent tables, and
 * the 24h cool-down gate is on `last_overdue_action_at` — so the worst
 * possible interleaving (event log written, tier bump fails) leaves a
 * harmless extra audit row and the next sweep re-fires the action. The
 * inverse (tier bump succeeds, event log fails) is the more "expensive"
 * failure but still safe: cool-down protects against double-action.
 */
export async function markOverdueAction(
  taskId: string,
  tier: Exclude<OverdueTier, 0>,
  event: 'nudged' | 'escalated' | 'auto_rescheduled',
  context?: {
    teamId?: string;
    teammateId?: string | null;
    daysOverdue?: number;
    previousScheduledDate?: string | null;
    newScheduledDate?: string | null;
    ownerUserId?: string | null;
    handoff?: string;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error: tierErr } = await supabase
    .from('agent_tasks')
    .update({
      overdue_tier: tier,
      last_overdue_action_at: nowIso,
    })
    .eq('id', taskId);
  if (tierErr) throw new Error(`markOverdueAction tier-write failed: ${tierErr.message}`);

  // We need teamId for the event-log row. Cheapest path: take it from the
  // caller's context. If absent (defensive), fetch the row.
  let teamId = context?.teamId ?? null;
  if (!teamId) {
    const { data } = await supabase
      .from('agent_tasks')
      .select('team_id')
      .eq('id', taskId)
      .maybeSingle();
    teamId = (data?.team_id as string | undefined) ?? null;
  }
  if (!teamId) {
    // Should never happen for a real task — log and skip the event row.
    logger.warn('markOverdueAction missing teamId for event log', { taskId, tier, event });
    return;
  }

  await logEvent({
    teamId,
    teammateId: context?.teammateId ?? null,
    taskId,
    event,
    payload: {
      tier,
      daysOverdue: context?.daysOverdue,
      previousScheduledDate: context?.previousScheduledDate ?? null,
      newScheduledDate: context?.newScheduledDate ?? null,
      ownerUserId: context?.ownerUserId ?? null,
      handoff: context?.handoff,
    },
  });
}

/**
 * Owner-initiated snooze. Pushes `scheduled_date` (and
 * `scheduled_until_date` if set) forward by N calendar days, resets the
 * overdue tier to 0, clears the cool-down timestamp, and writes a 'snoozed'
 * event-log row so the audit trail tracks who-snoozed-what.
 *
 * `days` is validated by the calling route (1–30); this helper trusts that.
 */
export async function snoozeTask(taskId: string, days: number): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from('agent_tasks')
    .select('team_id, assigned_to, scheduled_date, scheduled_until_date')
    .eq('id', taskId)
    .maybeSingle();
  if (fetchErr) throw new Error(`snoozeTask fetch failed: ${fetchErr.message}`);
  if (!row) throw new Error('snoozeTask: task not found');
  const startKey = row.scheduled_date as string | null;
  // If a task has no schedule, snooze pushes from today.
  const baseStart = startKey ?? new Date().toISOString().slice(0, 10);
  const baseEndKey = (row.scheduled_until_date as string | null) ?? baseStart;
  const startMs = Date.parse(`${baseStart}T00:00:00Z`);
  const endMs = Date.parse(`${baseEndKey}T00:00:00Z`);
  const DAY = 24 * 60 * 60 * 1000;
  const newStart = new Date(startMs + days * DAY).toISOString().slice(0, 10);
  const newEnd = new Date(endMs + days * DAY).toISOString().slice(0, 10);
  const updateEnd = (row.scheduled_until_date as string | null) ? newEnd : null;

  const { error: updErr } = await supabase
    .from('agent_tasks')
    .update({
      scheduled_date: newStart,
      scheduled_until_date: updateEnd,
      overdue_tier: 0,
      last_overdue_action_at: null,
      schedule_note: `snoozed ${days} day${days === 1 ? '' : 's'} (from ${startKey ?? 'unscheduled'})`,
    })
    .eq('id', taskId);
  if (updErr) throw new Error(`snoozeTask update failed: ${updErr.message}`);

  await logEvent({
    teamId: row.team_id as string,
    teammateId: (row.assigned_to as string | null) ?? null,
    taskId,
    event: 'snoozed',
    payload: {
      days,
      previousScheduledDate: startKey,
      newScheduledDate: newStart,
    },
  });
}

// ── Sweep entry point ──────────────────────────────────────────────────────

type TeamOverdueRow = {
  id: string;
  name: string;
  created_by: string;
};

type TaskOverdueRow = TaskRow & {
  overdue_tier: number | null;
  last_overdue_action_at: string | null;
};

function activeTaskMap(row: TaskOverdueRow): AgentTask & {
  overdueTier: OverdueTier;
  lastOverdueActionAt: string | null;
} {
  return {
    ...mapTask(row),
    overdueTier: ((row.overdue_tier ?? 0) as OverdueTier),
    lastOverdueActionAt: row.last_overdue_action_at,
  };
}

export async function sweepOverdueTeams(today: Date = new Date()): Promise<{
  teamsProcessed: number;
  actionsByKind: OverdueSweepCounts;
}> {
  // Lazy import — `overdueRunner` imports back from this module
  // (`markOverdueAction`, `reassignTask`, `setTaskSchedule`,
  // `loadHoursByDateForTeammate`, `loadHoursByDateForUser`), and a top-of-file
  // import would create an evaluation cycle.
  const { executeOverdueAction } = await import('./overdueRunner');
  const counts: OverdueSweepCounts = {
    nudge_teammate: 0,
    escalate_to_owner: 0,
    auto_reschedule: 0,
    none: 0,
  };

  const { data: teamRows, error: teamsErr } = await supabase
    .from('teams')
    .select('id, name, created_by')
    .eq('overdue_pressure_enabled', true);
  if (teamsErr) throw new Error(`sweepOverdueTeams teams query failed: ${teamsErr.message}`);
  const teams = (teamRows ?? []) as TeamOverdueRow[];

  for (const team of teams) {
    // Load active-status tasks for the team, including the overdue columns.
    const { data: taskRows, error: tasksErr } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('team_id', team.id)
      .in('status', ACTIVE_OVERDUE_STATUSES as unknown as string[]);
    if (tasksErr) throw new Error(`sweepOverdueTeams tasks query failed: ${tasksErr.message}`);

    const tasks = ((taskRows ?? []) as TaskOverdueRow[])
      .filter((r) => isAssignableTaskRow(r))
      .map((r) => activeTaskMap(r));

    if (tasks.length === 0) continue;

    const teammates = await listTeammatesWithStats(team.id);

    // Resolve the owner once per team. `teams.created_by` is the canonical
    // owner anchor; their email lives on the `users` table.
    const ownerUserId = team.created_by;
    const { data: ownerRow } = await supabase
      .from('users')
      .select('email, nickname')
      .eq('id', ownerUserId)
      .maybeSingle();
    const owner = {
      userId: ownerUserId,
      email: (ownerRow?.email as string | undefined) ?? null,
      nickname: (ownerRow?.nickname as string | undefined) ?? null,
    };

    for (const task of tasks) {
      const action = decideOverdueAction({
        task: {
          id: task.id,
          status: task.status,
          scheduledDate: task.scheduledDate,
          scheduledUntilDate: task.scheduledUntilDate,
          assignedTo: task.assignedTo,
          overdueTier: task.overdueTier,
          lastOverdueActionAt: task.lastOverdueActionAt,
        },
        teamOverduePressureEnabled: true,
        today,
      });

      if (action.kind === 'none') {
        counts.none++;
        continue;
      }

      const teammate = teammates.find((tm) => tm.id === task.assignedTo);
      if (!teammate) {
        // Task is assigned to someone who no longer exists / is retired.
        // Treat as a no-op — owner-side cleanup is a separate concern.
        counts.none++;
        continue;
      }

      try {
        await executeOverdueAction(task, action, teammate, owner, today);
        counts[action.kind]++;
      } catch (err) {
        logger.error('sweepOverdueTeams: executeOverdueAction failed', {
          err: err instanceof Error ? err.message : String(err),
          taskId: task.id,
          kind: action.kind,
        });
        // Keep going — one bad task shouldn't abort the whole sweep.
      }
    }
  }

  return { teamsProcessed: teams.length, actionsByKind: counts };
}
