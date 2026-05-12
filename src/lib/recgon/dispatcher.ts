// Recgon dispatcher — the loop that turns the unified brain into assignments.
//
// 1. Read unified brain
// 2. Mint tasks (idempotent via dedupKey)
// 3. For each unassigned task in the team, score every active teammate and
//    pick the best. If best < MIN_FIT_SCORE, leave unassigned and log no_fit.
// 4. Write assignment, append assignment_log, log event, enqueue execution
//    for AI assignments (notification for humans handled in Slice 2).

import { logger } from '../logger';
import { supabase } from '../supabase';
import { notifyTeammateAssigned } from '../notifications';
import { readUnifiedBrain } from './brain';
import { mintTasksFromBrain } from './taskMint';
import { rankMatches, type MatchResult } from './match';
import { planTaskSchedule, scheduleTimelinessScore, type SchedulePlan } from './scheduler';
import { tagSingleTaskWithSkills } from './skillTagger';
import { listProfiles } from './profileStorage';
import { listActiveInferredSkillsForTeam } from './inferredSkillsStorage';
import { profileMerge } from './profileMerge';
import {
  listTeammatesWithStats,
  listTasks,
  listUnassignedTasks,
  assignTask,
  setTaskSchedule,
  loadHoursByDateForTeammate,
  loadHoursByDateForUser,
  appendAssignmentLog,
  saveBrainSnapshot,
  logEvent,
  getTask,
  getTeammate,
  updateTaskRequiredSkills,
} from './storage';
import type { AgentTask, AssignmentLogEntry, BrainSnapshot, InferredSkill, TaskStatus, TeammateProfile, WorkingHours } from './types';

// PROFILE-04 (Phase 1) + SKILL-04 (Phase 2 / Plan 02-04): thread self-declared
// profiles AND GitHub-inferred skills through profileMerge before rankMatches.
// `inferredByTeammate` is loaded once per dispatch (T-02-22 — no N+1) and may
// be empty (legacy / no-consent teams); a teammate with no inferred-skill row
// falls back to `null` → profileMerge Phase 1 behavior, regression-safe.
function applyProfileMerge<T extends { id: string; userId: string | null; skills: string[]; capacityHours: number; fitProfile: import('./types').FitProfile }>(
  teammates: T[],
  profiles: TeammateProfile[],
  inferredByTeammate: Map<string, Map<string, InferredSkill>>,
): Array<T & { interests?: string[] }> {
  const byUserId = new Map(profiles.map((p) => [p.userId, p]));
  return teammates.map((t) => {
    const profile = t.userId ? (byUserId.get(t.userId) ?? null) : null;
    const inferred = inferredByTeammate.get(t.id) ?? null;
    // profileMerge returns Teammate & { interests: string[] }; we cast back to
    // preserve any extra TeammateWithStats fields (stars/ratingCount/etc) that
    // the merge call passed through via spread.
    return profileMerge(t as any, profile, inferred, t.fitProfile) as unknown as T & { interests?: string[] };
  });
}

const ACTIVE_NON_TERMINAL_STATUSES: TaskStatus[] = [
  'assigned',
  'accepted',
  'in_progress',
  'awaiting_review',
];

// Legacy brain tasks were minted with generic per-source tags ({strategy,
// next_step, product}, {code, engineering, dev_prompt}, etc.) that don't
// describe the work. If a backlog task carries one of these stale templates
// verbatim, retag it from title+description before scoring.
const LEGACY_GENERIC_SKILL_SETS = [
  ['strategy', 'next_step', 'product'],
  ['code', 'engineering', 'dev_prompt'],
  ['code', 'engineering', 'bugfix'],
  ['research', 'product', 'strategy'],
  ['strategy', 'product', 'risk'],
  ['analytics', 'data'],
  ['strategy', 'product', 'review'],
];

function isLegacyGenericSkills(skills: string[] | null | undefined): boolean {
  if (!skills || skills.length === 0) return true;
  const norm = [...skills].map((s) => s.toLowerCase()).sort().join('|');
  return LEGACY_GENERIC_SKILL_SETS.some(
    (template) => [...template].sort().join('|') === norm,
  );
}

async function ensureFreshSkills(task: AgentTask): Promise<AgentTask> {
  if (!isLegacyGenericSkills(task.requiredSkills)) return task;
  try {
    const fresh = await tagSingleTaskWithSkills({
      id: task.id,
      title: task.title,
      description: task.description,
      kind: task.kind,
      fallbackSkills: task.requiredSkills ?? [],
    });
    if (fresh.length === 0 || fresh.join('|') === (task.requiredSkills ?? []).join('|')) {
      return task;
    }
    await updateTaskRequiredSkills(task.id, fresh);
    return { ...task, requiredSkills: fresh };
  } catch (err) {
    logger.warn('recgon retag failed; keeping stale skills', {
      taskId: task.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return task;
  }
}

async function getTeamName(teamId: string): Promise<string> {
  const { data } = await supabase.from('teams').select('name').eq('id', teamId).maybeSingle();
  return (data?.name as string) ?? 'your team';
}

type ScheduledMatch = {
  match: MatchResult;
  plan: SchedulePlan;
  combinedScore: number;
};

export type DispatchResult = {
  brainSnapshot: BrainSnapshot;
  minted: number;
  skipped: number;
  assigned: number;
  noFit: number;
  backfilled: number;
};

export async function runDispatch(teamId: string): Promise<DispatchResult> {
  const snapshot = await readUnifiedBrain(teamId);
  await saveBrainSnapshot(teamId, snapshot);
  const { minted, skipped } = await mintTasksFromBrain(teamId, snapshot);

  // Score against the full unassigned backlog, not just freshly minted, so
  // user-created tasks get picked up too.
  const backlog = await listUnassignedTasks(teamId);
  const teammates = await listTeammatesWithStats(teamId);

  // PROFILE-04 + SKILL-04: load self-declared profiles AND GitHub-inferred
  // skill rows once per dispatch and thread each teammate through profileMerge
  // before scoring. The merged shape is a superset of TeammateWithStats (adds
  // optional `interests`), so passing it into dispatchSingleTask does not
  // widen the signature. The inferred-skill loader (T-02-22 mitigation) does
  // a single team-scoped batch SQL query and groups rows in memory.
  const profiles = await listProfiles(teamId);
  const inferredByTeammate = await listActiveInferredSkillsForTeam(teamId);
  logger.info('recgon dispatch: loaded inferred skills', {
    teamId,
    teammateCount: inferredByTeammate.size,
  });
  const mergedTeammates = applyProfileMerge(teammates, profiles, inferredByTeammate);

  // Catch up tasks assigned before the calendar-aware migration (or whose
  // schedule was wiped some other way): they have an owner but no
  // scheduled_date, so they show up as "unscheduled" in the calendar even
  // though work is in flight. Reschedule on the assignee's calendar.
  // NOTE: schedule backfill operates on calendars, not assignment math — it
  // must continue to read the raw `teammates` shape (no merged interests / no
  // overridden capacity), otherwise scheduling on existing assignments regresses.
  const backfilled = await backfillLegacySchedules(teamId, teammates);

  let assigned = 0;
  let noFit = 0;

  for (const task of backlog) {
    const result = await dispatchSingleTask(teamId, task, mergedTeammates);
    if (result === 'assigned') assigned++;
    else if (result === 'no_fit') noFit++;
  }

  logger.info('recgon dispatch complete', {
    teamId,
    minted: minted.length,
    skipped,
    assigned,
    noFit,
    backfilled,
  });

  return {
    brainSnapshot: snapshot,
    minted: minted.length,
    skipped,
    assigned,
    noFit,
    backfilled,
  };
}

async function backfillLegacySchedules(
  teamId: string,
  teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>,
): Promise<number> {
  const tasks = await listTasks(teamId, { status: ACTIVE_NON_TERMINAL_STATUSES });
  const stale = tasks.filter((t) => t.assignedTo && !t.scheduledDate);
  if (stale.length === 0) return 0;
  let count = 0;
  for (const task of stale) {
    const teammate = teammates.find((tm) => tm.id === task.assignedTo);
    if (!teammate || teammate.status === 'retired') continue;
    const plan = await buildSchedulePlan(task, teammate);
    if (!plan) continue;
    await setTaskSchedule(task.id, {
      scheduledDate: plan.scheduledDate,
      deadline: plan.deadline,
      scheduleNote: plan.scheduleNote,
    });
    count++;
  }
  return count;
}

async function dispatchSingleTask(
  teamId: string,
  rawTask: AgentTask,
  teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>,
  excludeIds: string[] = [],
): Promise<'assigned' | 'no_fit' | 'skip'> {
  // Retag legacy tasks (minted before LLM tagging) so they get scored on
  // role-aware skills instead of the generic placeholder tags.
  const task = await ensureFreshSkills(rawTask);
  const excluded = new Set(excludeIds);
  // First pass: respect exclusions (e.g. the teammate who just declined).
  const candidatePool = teammates.filter((t) => !excluded.has(t.id));
  let best = await pickBestScheduledMatch(task, candidatePool);

  // Second pass: if no compatible candidate, retry without exclusions before
  // we fall through to the owner. This catches the case where the only
  // possible assignee was the decliner — better the owner sees it than
  // the task get bounced right back to them.
  if (!best && excluded.size > 0) {
    best = await pickBestScheduledMatch(task, teammates);
  }

  // Final fallback: assign to the team owner so they can decide. We do this
  // instead of leaving the task unassigned because Recgon found nobody who
  // scored well — this is exactly when a human needs to weigh in.
  if (!best) {
    const ownerTeammate = teammates.find(
      (t) => t.teamRole === 'owner' && t.status === 'active' && !excluded.has(t.id),
    ) ?? teammates.find((t) => t.teamRole === 'owner' && t.status === 'active');
    if (ownerTeammate) {
      const ownerPlan = await buildSchedulePlan(task, ownerTeammate);
      if (!ownerPlan) {
        await logNoFit(teamId, task, 'no_calendar_capacity');
        return 'no_fit';
      }
      await assignScheduledTask(task, ownerTeammate.id, 'recgon', ownerPlan);
      await logEvent({
        teamId,
        teammateId: ownerTeammate.id,
        taskId: task.id,
        event: 'assigned',
        payload: {
          reason: 'owner_fallback',
          kind: task.kind,
          requiredSkills: task.requiredSkills,
          scheduledDate: ownerPlan.scheduledDate,
          scheduleNote: ownerPlan.scheduleNote,
        },
      });
      const [teamName, full] = await Promise.all([
        getTeamName(teamId),
        getTeammate(ownerTeammate.id),
      ]);
      if (full) {
        notifyTeammateAssigned({ teammate: full, task: withPlan(task, ownerPlan), teamName }).catch((err) => {
          logger.warn('notify owner-fallback failed', {
            taskId: task.id,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      }
      await appendAssignmentLog(teamId, {
        taskId: task.id,
        taskTitle: task.title,
        teammateId: ownerTeammate.id,
        teammateName: ownerTeammate.displayName,
        score: 0,
        reason: 'owner_fallback_calendar_fit',
        ts: new Date().toISOString(),
      });
      return 'assigned';
    }

    await logNoFit(teamId, task, 'no_fit_or_calendar_capacity');
    return 'no_fit';
  }

  await assignScheduledTask(task, best.match.teammate.id, 'recgon', best.plan);
  await logEvent({
    teamId,
    teammateId: best.match.teammate.id,
    taskId: task.id,
    event: 'assigned',
    payload: {
      score: best.match.score,
      combinedScore: best.combinedScore,
      breakdown: best.match.breakdown,
      scheduledDate: best.plan.scheduledDate,
      scheduleNote: best.plan.scheduleNote,
    },
  });

  // Email + in-app notification for the assignee.
  const [teamName, full] = await Promise.all([
    getTeamName(teamId),
    getTeammate(best.match.teammate.id),
  ]);
  if (full) {
    notifyTeammateAssigned({ teammate: full, task: withPlan(task, best.plan), teamName }).catch((err) => {
      logger.warn('notify teammate failed', {
        taskId: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  const logEntry: AssignmentLogEntry = {
    taskId: task.id,
    taskTitle: task.title,
    teammateId: best.match.teammate.id,
    teammateName: best.match.teammate.displayName,
    score: Number(best.combinedScore.toFixed(3)),
    reason: 'best_fit_calendar_fit',
    ts: new Date().toISOString(),
  };
  await appendAssignmentLog(teamId, logEntry);
  return 'assigned';
}

async function pickBestScheduledMatch(
  task: AgentTask,
  teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>,
): Promise<ScheduledMatch | null> {
  const ranked = rankMatches(teammates, {
    kind: task.kind,
    requiredSkills: task.requiredSkills,
    estimatedHours: task.estimatedHours,
    priority: task.priority,
  });
  const schedulable: ScheduledMatch[] = [];
  for (const match of ranked) {
    const plan = await buildSchedulePlan(task, match.teammate);
    if (!plan) continue;
    const combinedScore =
      match.score * 0.72 +
      scheduleTimelinessScore(plan) * 0.28;
    schedulable.push({ match, plan, combinedScore });
  }
  schedulable.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    return a.plan.scheduledDate.localeCompare(b.plan.scheduledDate);
  });
  return schedulable[0] ?? null;
}

async function buildSchedulePlan(
  task: AgentTask,
  teammate: { id: string; userId?: string | null; capacityHours: number; workingHours: WorkingHours | null },
): Promise<SchedulePlan | null> {
  const now = new Date();
  const horizonDays = task.priority <= 0 ? 10 : 21;
  const hardDeadline = task.scheduleNote ? null : task.deadline;
  const to = hardDeadline
    ? new Date(hardDeadline)
    : new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(to.getTime())) return null;
  const fromDate = now.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);
  // Cross-team load for human teammates so tasks from other teams count.
  const loadByDate = teammate.userId
    ? await loadHoursByDateForUser(teammate.userId, fromDate, toDate, task.id)
    : await loadHoursByDateForTeammate(teammate.id, fromDate, toDate, task.id);
  return planTaskSchedule({
    teammate,
    task: { ...task, deadline: hardDeadline },
    loadByDate,
    now,
    horizonDays,
  });
}

async function assignScheduledTask(
  task: AgentTask,
  teammateId: string,
  assignedBy: 'recgon' | string,
  plan: SchedulePlan,
): Promise<void> {
  await assignTask(task.id, teammateId, assignedBy, null, {
    scheduledDate: plan.scheduledDate,
    deadline: plan.deadline,
    scheduleNote: plan.scheduleNote,
  });
}

function withPlan(task: AgentTask, plan: SchedulePlan): AgentTask {
  return {
    ...task,
    deadline: plan.deadline,
    scheduledDate: plan.scheduledDate,
    scheduleNote: plan.scheduleNote,
  };
}

async function logNoFit(teamId: string, task: AgentTask, reason: string): Promise<void> {
  await logEvent({
    teamId,
    taskId: task.id,
    event: 'no_fit',
    payload: { kind: task.kind, requiredSkills: task.requiredSkills, reason },
  });
  await appendAssignmentLog(teamId, {
    taskId: task.id,
    taskTitle: task.title,
    teammateId: null,
    teammateName: null,
    score: 0,
    reason,
    ts: new Date().toISOString(),
  });
}

// Used by tests and by the manual /recgon/dispatch route. Re-exports the same
// path for explicit single-task dispatch (e.g. on user-created task insert).
export async function dispatchTask(
  teamId: string,
  taskId: string,
  options: { excludeTeammateIds?: string[] } = {},
): Promise<'assigned' | 'no_fit' | 'skip'> {
  const task = await getTask(taskId);
  if (!task || task.status !== 'unassigned') return 'skip';
  const teammates = await listTeammatesWithStats(teamId);
  // PROFILE-04 + SKILL-04: same merge as runDispatch so the manual single-task
  // path (user-created tasks, decliner re-dispatch) matches the cron behavior.
  const profiles = await listProfiles(teamId);
  const inferredByTeammate = await listActiveInferredSkillsForTeam(teamId);
  const mergedTeammates = applyProfileMerge(teammates, profiles, inferredByTeammate);
  return dispatchSingleTask(teamId, task, mergedTeammates, options.excludeTeammateIds ?? []);
}
