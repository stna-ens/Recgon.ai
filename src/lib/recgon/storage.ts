// Recgon storage — CRUD against the new tables introduced by
// supabase/migrations/20260426_recgon_admin.sql. Mirrors the pattern in
// src/lib/teamStorage.ts: thin wrappers around the service-role Supabase
// client with snake_case ↔ camelCase mapping.

import { supabase } from '../supabase';
import type {
  Teammate,
  TeammateWithStats,
  TeammateKind,
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
  RosterProposal,
  BrainSnapshot,
  ProofPayload,
  VerificationStatus,
  VerificationEvidence,
} from './types';

// Keep the assignment log bounded so the row doesn't grow unbounded.
const ASSIGNMENT_LOG_MAX = 50;

type TeammateRow = {
  id: string;
  team_id: string;
  kind: TeammateKind;
  user_id: string | null;
  display_name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  title: string | null;
  skills: string[] | null;
  system_prompt: string | null;
  model_pref: 'gemini' | 'claude' | null;
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
    kind: row.kind,
    userId: row.user_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    title: row.title,
    skills: row.skills ?? [],
    systemPrompt: row.system_prompt,
    modelPref: row.model_pref,
    capacityHours: Number(row.capacity_hours),
    workingHours: row.working_hours,
    fitProfile: row.fit_profile ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

type TaskRow = {
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
};

function mapTask(row: TaskRow): AgentTask {
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
  };
}

// ── Teammates ───────────────────────────────────────────────────────────────

export type TeammateInsert = {
  teamId: string;
  kind: TeammateKind;
  userId?: string | null;
  displayName: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  skills?: string[];
  systemPrompt?: string | null;
  modelPref?: 'gemini' | 'claude' | null;
  capacityHours?: number;
  workingHours?: WorkingHours | null;
};

export async function createTeammate(input: TeammateInsert): Promise<Teammate> {
  const { data, error } = await supabase
    .from('teammates')
    .insert({
      team_id: input.teamId,
      kind: input.kind,
      user_id: input.userId ?? null,
      display_name: input.displayName,
      avatar_color: input.avatarColor ?? null,
      avatar_url: input.avatarUrl ?? null,
      title: input.title ?? null,
      skills: input.skills ?? [],
      system_prompt: input.systemPrompt ?? null,
      model_pref: input.modelPref ?? null,
      capacity_hours: input.capacityHours ?? (input.kind === 'human' ? 10 : 168),
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
    .order('kind', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listTeammates failed: ${error.message}`);
  return (data ?? []).map((r) => mapTeammate(r as TeammateRow));
}

export async function listTeammatesWithStats(teamId: string): Promise<TeammateWithStats[]> {
  const teammates = await listTeammates(teamId);
  if (teammates.length === 0) return [];
  const ids = teammates.map((t) => t.id);
  const userIds = teammates.map((t) => t.userId).filter((u): u is string => !!u);
  const [statsRes, rolesRes] = await Promise.all([
    supabase.from('teammate_stats').select('*').in('teammate_id', ids),
    userIds.length
      ? supabase.from('team_members').select('user_id, role').eq('team_id', teamId).in('user_id', userIds)
      : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
  ]);
  const byId = new Map<string, Record<string, unknown>>();
  (statsRes.data ?? []).forEach((s) => byId.set(s.teammate_id as string, s as Record<string, unknown>));
  const roleByUser = new Map<string, 'owner' | 'member' | 'viewer'>();
  (rolesRes.data ?? []).forEach((r) => {
    const role = r.role as string;
    if (role === 'owner' || role === 'member' || role === 'viewer') {
      roleByUser.set(r.user_id as string, role);
    }
  });
  return teammates.map((t) => {
    const s = byId.get(t.id);
    return {
      ...t,
      stars: s ? Number(s.stars) : 3.5,
      ratingCount: s ? Number(s.rating_count) : 0,
      upCount: s ? Number(s.up_count) : 0,
      downCount: s ? Number(s.down_count) : 0,
      inFlightCount: s ? Number(s.in_flight_count) : 0,
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
  if (fields.systemPrompt !== undefined) update.system_prompt = fields.systemPrompt;
  if (fields.modelPref !== undefined) update.model_pref = fields.modelPref;
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
  const { data, error } = await supabase
    .from('agent_tasks')
    .insert({
      team_id: input.teamId,
      project_id: input.projectId ?? null,
      title: input.title,
      description: input.description ?? '',
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
  return (data ?? []).map((r) => mapTask(r as TaskRow));
}

export async function listUnassignedTasks(teamId: string): Promise<AgentTask[]> {
  return listTasks(teamId, { status: 'unassigned' });
}

export async function getTask(taskId: string): Promise<AgentTask | null> {
  const { data } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
  return data ? mapTask(data as TaskRow) : null;
}

export async function assignTask(
  taskId: string,
  teammateId: string,
  assignedBy: 'recgon' | string,
  jobId?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('agent_tasks')
    .update({
      assigned_to: teammateId,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
      job_id: jobId ?? null,
    })
    .eq('id', taskId);
  if (error) throw new Error(`assignTask failed: ${error.message}`);
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
): Promise<void> {
  const update: Record<string, unknown> = {
    assigned_to: teammateId,
    assigned_by: assignedBy,
    assigned_at: teammateId ? new Date().toISOString() : null,
    status: teammateId ? 'assigned' : 'unassigned',
    job_id: null,
  };
  const { error } = await supabase.from('agent_tasks').update(update).eq('id', taskId);
  if (error) throw new Error(`reassignTask failed: ${error.message}`);
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
      rosterProposal: null,
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
    rosterProposal: (data.roster_proposal as RosterProposal | null) ?? null,
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

export async function saveRosterProposal(
  teamId: string,
  proposal: RosterProposal | null,
): Promise<void> {
  await supabase
    .from('recgon_state')
    .upsert({
      team_id: teamId,
      roster_proposal: proposal,
      updated_at: new Date().toISOString(),
    });
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
    | 'overloaded'
    | 'no_fit';
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
