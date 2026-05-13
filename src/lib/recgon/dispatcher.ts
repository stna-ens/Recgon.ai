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
import { chatViaProviders } from '../llm/providers';
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
  runJudgment,
  computeJudgeCacheKey,
  CLOSE_CALL_THRESHOLD,
  JudgeError,
  type JudgeChatAdapter,
} from './judge';
import {
  checkAndIncrement,
  alertCapExceededOnce,
  currentUsageDate,
} from './judgmentBudget';
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
import type {
  AgentTask,
  AssignmentLogEntry,
  AssignmentReasoning,
  BrainSnapshot,
  InferredSkill,
  JudgePick,
  JudgeTaskInput,
  TaskStatus,
  TeammateProfile,
  WorkingHours,
} from './types';

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

  // ── PASS 1: rank-all → identify close-call subset ──────────────────────
  // Per RESEARCH Q4 / CONTEXT D-30: walk the whole backlog once, scoring
  // every teammate per task. `RankEntry.isCloseCall` is true when the math
  // gap between top-1 and top-2 is < CLOSE_CALL_THRESHOLD (0.20). Tasks
  // with a clear winner skip the judge entirely (JUDGE-02).
  const ranked = new Map<string, RankEntry>();
  for (const task of backlog) {
    const fresh = await ensureFreshSkills(task);
    const r = rankMatches(mergedTeammates, {
      kind: fresh.kind,
      requiredSkills: fresh.requiredSkills,
      estimatedHours: fresh.estimatedHours,
      priority: fresh.priority,
    });
    const isCloseCall =
      r.length >= 2 && r[0].score - r[1].score < CLOSE_CALL_THRESHOLD;
    ranked.set(fresh.id, { task: fresh, ranked: r, isCloseCall });
  }

  // ── PASS 2: one batched judge call for all close-calls ─────────────────
  // Cache lifecycle: created here, dies with this function. No module-level
  // state (would leak across cron runs and re-bill cached tasks).
  const cache = new Map<string, JudgePick>();
  const closeCalls = [...ranked.values()].filter(
    (e) => e.isCloseCall && e.ranked.length >= 2,
  );
  const judgeMap = await applyJudgmentIfClose(closeCalls, {
    teamId,
    cache,
    chat: chatViaProviders,
  });

  // ── PASS 3: assign each task per judge pick OR math top-1 ──────────────
  let assigned = 0;
  let noFit = 0;
  for (const [taskId, entry] of ranked) {
    const pick = judgeMap.get(taskId) ?? null;
    const reasoning = buildAssignmentReasoning(entry, pick);
    const result = await dispatchSingleTaskWithReasoning(
      teamId,
      entry.task,
      entry.ranked,
      pick,
      reasoning,
      mergedTeammates,
    );
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
    closeCalls: closeCalls.length,
    judgePicks: judgeMap.size,
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

// ── Pass 2 helper: batched LLM judge call with cache + cap ─────────────────

type RankEntry = {
  task: AgentTask;
  ranked: MatchResult[];
  isCloseCall: boolean;
};

type JudgeCtx = {
  teamId: string;
  cache: Map<string, JudgePick>;
  chat: JudgeChatAdapter;
};

/**
 * Pass 2 of the 3-pass dispatch shape (RESEARCH Q4). Builds judge inputs
 * for every close-call task, batches recent-task lookups (no N+1), checks
 * the daily safety cap, and invokes `runJudgment` ONCE for the whole batch.
 *
 * Returns a Map<taskId, JudgePick> — empty when no close-calls, cap hit,
 * or the LLM throws. Caller falls back to math top-1 for any unmapped task.
 */
async function applyJudgmentIfClose(
  closeCalls: RankEntry[],
  ctx: JudgeCtx,
): Promise<Map<string, JudgePick>> {
  const out = new Map<string, JudgePick>();
  if (closeCalls.length === 0) return out;

  // Cap check FIRST — if exhausted, alert (idempotent) and silent fallback.
  const capDecision = await checkAndIncrement(ctx.teamId);
  if (!capDecision.allowed) {
    logger.info('judge_skipped_cap', {
      teamId: ctx.teamId,
      callsToday: capDecision.callsToday,
    });
    await alertCapExceededOnce(ctx.teamId, currentUsageDate());
    return out;
  }

  // Build the batched judge inputs. Each entry slices the math top-3 (or
  // top-2 when only 2 candidates clear MIN_FIT_SCORE per CONTEXT open-Q).
  // SECURITY: candidate skill tags are canonical-vocab only (Phase 2 D-23);
  // task.title is Recgon-minted (T-03-02-06), not user-typed.
  const judgeInputs: JudgeTaskInput[] = [];
  const taskIdByInput = new Map<string, RankEntry>();
  const cachedPicks: JudgePick[] = [];

  // Batched recent-tasks query — single SELECT for ALL close-call candidates,
  // grouped client-side. T-02-22 precedent (no N+1 per candidate).
  const candidateUserIds = new Set<string>();
  for (const entry of closeCalls) {
    for (const m of entry.ranked.slice(0, 3)) {
      const uid = (m.teammate as { userId?: string | null }).userId;
      if (uid) candidateUserIds.add(uid);
    }
  }
  const recentByUser = await loadRecentTasksForCandidates(
    ctx.teamId,
    [...candidateUserIds],
  );

  for (const entry of closeCalls) {
    const topN = entry.ranked.slice(0, 3); // max 3 by CONTEXT JUDGE-01
    const input = buildJudgeTaskInput(entry.task, topN, recentByUser);

    // Cache check: skip the LLM for tuples we've already judged. The cache
    // lives only for this dispatch run, but `dispatchTask` (manual single-
    // task path) also flows through this helper, so the cache is meaningful
    // even at N=1 if the function is invoked twice with the same tuple.
    const cacheKey = computeJudgeCacheKey(
      entry.task.id,
      topN.map((m) => (m.teammate as { userId?: string | null }).userId ?? m.teammate.id),
      hashScores(topN),
    );
    const cached = ctx.cache.get(cacheKey);
    if (cached) {
      cachedPicks.push(cached);
      continue;
    }
    judgeInputs.push(input);
    taskIdByInput.set(entry.task.id, entry);
  }

  // Apply cached picks immediately.
  for (const c of cachedPicks) out.set(c.task_id, c);

  if (judgeInputs.length === 0) {
    // All close-calls were cache hits — nothing to call the LLM for.
    logger.info('judge_batch_invoked', {
      teamId: ctx.teamId,
      closeCallCount: closeCalls.length,
      cacheHits: cachedPicks.length,
      llmCalls: 0,
    });
    return out;
  }

  try {
    const result = await runJudgment(judgeInputs, {
      chat: ctx.chat,
      timeoutMs: 10_000,
    });

    // Extra hardening: validate picks cover EXACTLY the requested task_ids.
    // runJudgment already enforces this, but Pass 3's index math assumes it
    // so we re-assert at the dispatcher boundary.
    const expectedIds = new Set(judgeInputs.map((t) => t.taskId));
    for (const pick of result.picks) {
      if (!expectedIds.has(pick.task_id)) {
        throw new JudgeError(
          `judge returned pick for unknown task_id '${pick.task_id}'`,
        );
      }
    }

    for (const pick of result.picks) {
      out.set(pick.task_id, pick);
      // Populate the cache for future re-runs of the same tuple.
      const entry = taskIdByInput.get(pick.task_id);
      if (entry) {
        const topN = entry.ranked.slice(0, 3);
        const cacheKey = computeJudgeCacheKey(
          entry.task.id,
          topN.map((m) => (m.teammate as { userId?: string | null }).userId ?? m.teammate.id),
          hashScores(topN),
        );
        ctx.cache.set(cacheKey, pick);
      }
    }

    logger.info('judge_batch_invoked', {
      teamId: ctx.teamId,
      closeCallCount: closeCalls.length,
      cacheHits: cachedPicks.length,
      llmCalls: 1,
    });
  } catch (err) {
    // JudgeError or any throw → math fallback for everyone in this batch.
    // Cached picks (if any) still apply.
    logger.warn('judge_batch_failed', {
      teamId: ctx.teamId,
      err: err instanceof Error ? err.message : String(err),
    });
    // out keeps whatever cache hits we already populated; new picks dropped.
  }

  return out;
}

/**
 * Build a judge input for one task from its math top-N and the per-user
 * recent-tasks payload. The anon_id mapping is implicit by array index:
 * ranked[0] → candidate_1, ranked[1] → candidate_2, ranked[2] → candidate_3.
 * No names, no user_ids leave this function — that's the privacy boundary.
 */
function buildJudgeTaskInput(
  task: AgentTask,
  topN: MatchResult[],
  recentByUser: Map<string, Array<{ kind: string; skills: string[]; avgRating?: number }>>,
): JudgeTaskInput {
  return {
    taskId: task.id,
    title: task.title,
    kind: task.kind,
    requiredSkills: task.requiredSkills,
    estimatedHours: task.estimatedHours,
    candidates: topN.map((m) => {
      const uid = (m.teammate as { userId?: string | null }).userId ?? m.teammate.id;
      const interests = ((m.teammate as { interests?: string[] }).interests) ?? [];
      return {
        score: m.score,
        breakdown: {
          skill_match: m.breakdown.skillOverlap,
          fit_for_task_kind: m.breakdown.fitForKind,
          calendar_availability: m.breakdown.availabilityNow,
          workload_headroom: m.breakdown.loadHeadroom,
        },
        confirmedSkills: m.teammate.skills ?? [],
        interests,
        recentTasks: recentByUser.get(uid) ?? [],
      };
    }),
  };
}

/**
 * Stable digest of the math scores so the cache key shifts whenever the
 * ranking math changes. Lightweight (no crypto import) — the goal is
 * "different inputs → different keys", not security.
 */
function hashScores(matches: MatchResult[]): string {
  return matches
    .map((m) => `${m.score.toFixed(4)}|${m.breakdown.skillOverlap.toFixed(4)}`)
    .join(',');
}

/**
 * Batched read of recent completed tasks for the close-call candidates.
 * Single SELECT keyed by `team_id` + `assigned_to IN (...)` + 14-day window.
 * Groups by `user_id` in memory; returns lightweight shape the judge prompt
 * consumes (kind + required_skills + completed rating proxy).
 *
 * If the read errors, we return an empty map and the judge sees zero recent
 * tasks for each candidate — that's a graceful fallback, not a hard error.
 */
async function loadRecentTasksForCandidates(
  teamId: string,
  userIds: string[],
): Promise<Map<string, Array<{ kind: string; skills: string[]; avgRating?: number }>>> {
  const out = new Map<string, Array<{ kind: string; skills: string[]; avgRating?: number }>>();
  if (userIds.length === 0) return out;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await (supabase
      .from('agent_tasks')
      .select('assigned_to, kind, required_skills, completed_at')
      .eq('team_id', teamId)
      .in('assigned_to', userIds)
      .gte('completed_at', since)
      .eq('status', 'completed') as unknown as Promise<{
      data: Array<{
        assigned_to: string | null;
        kind: string;
        required_skills: string[] | null;
        completed_at: string | null;
      }> | null;
      error: unknown;
    }>);

    if (error || !data) return out;

    for (const row of data) {
      const uid = row.assigned_to;
      if (!uid) continue;
      const arr = out.get(uid) ?? [];
      arr.push({
        kind: row.kind,
        skills: row.required_skills ?? [],
      });
      out.set(uid, arr);
    }
  } catch (err) {
    logger.warn('loadRecentTasksForCandidates failed', {
      teamId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return out;
}

/**
 * Build the AssignmentReasoning envelope that gets passed to the storage
 * layer (Plan 03 will wire it to the DB write). For now the storage layer
 * silently drops the reasoning — it's threaded so the contract is in place.
 */
function buildAssignmentReasoning(
  entry: RankEntry,
  pick: JudgePick | null,
): AssignmentReasoning {
  const mathScore = entry.ranked[0]?.score ?? 0;
  const mathBreakdown = entry.ranked[0]?.breakdown ?? {
    skillOverlap: 0,
    fitForKind: 0,
    availabilityNow: 0,
    loadHeadroom: 0,
    interestNudge: 0,
  };
  if (pick) {
    return { kind: 'llm_tiebreaker', mathScore, mathBreakdown, judge: pick };
  }
  return { kind: 'math_only', mathScore, mathBreakdown };
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

/**
 * Pass 3 assignment helper. Takes the pre-ranked candidates, an optional
 * judge pick, and the AssignmentReasoning envelope. When `pick` is present
 * the chosen candidate is `ranked[pick.chosen_candidate_id - 1]`; otherwise
 * we use the math top-1.
 *
 * QUAL-03 defense-in-depth: validates `pick.chosen_candidate_id - 1 <
 * ranked.length` before honoring the override. Schema literal `1|2|3` is
 * the first line; this second-level check catches the edge case where the
 * batch had only 2 candidates and the LLM picked 3 anyway.
 *
 * Plan 03 will wire `reasoning` to the storage write — for now the
 * dispatcher computes it and passes it through; assignTask ignores it.
 */
async function dispatchSingleTaskWithReasoning(
  teamId: string,
  rawTask: AgentTask,
  ranked: MatchResult[],
  pick: JudgePick | null,
  reasoningIn: AssignmentReasoning,
  teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>,
  excludeIds: string[] = [],
): Promise<'assigned' | 'no_fit' | 'skip'> {
  // Phase 3 / Plan 03 — `reasoning` is LIVE: assignScheduledTask passes it
  // to assignTask, which persists it to agent_tasks.assignment_reasoning.
  // notifyTeammateAssigned also receives it for the "Why you" email line.
  //
  // WR-06 fix — reasoning may be overwritten below if the judge pick is
  // excluded (then the actual assignment is math fallback, so the
  // persisted/rendered reasoning must reflect that, not the discarded
  // tiebreaker).
  let reasoning: AssignmentReasoning = reasoningIn;

  // Retag legacy tasks (minted before LLM tagging) so they get scored on
  // role-aware skills instead of the generic placeholder tags. The Pass 1
  // ranking already saw the fresh skills, but `ensureFreshSkills` is
  // idempotent — running it again is a cheap noop if the skills haven't
  // changed since Pass 1.
  const task = await ensureFreshSkills(rawTask);
  const excluded = new Set(excludeIds);

  // Honor the judge override if present and valid (QUAL-03 second-level
  // check). Falls back to math top-1 if the index is out of range.
  let chosenMatch: MatchResult | null = null;
  if (pick && pick.chosen_candidate_id - 1 < ranked.length) {
    const idx = pick.chosen_candidate_id - 1;
    const candidate = ranked[idx];
    // Skip if the chosen candidate was excluded by the caller (e.g. recent
    // decliner). Falls through to the next-ranked path below.
    if (!excluded.has(candidate.teammate.id)) {
      chosenMatch = candidate;
    } else {
      logger.warn('judge pick excluded by caller; falling back to math top-1', {
        taskId: task.id,
        teammateId: candidate.teammate.id,
      });
      // WR-06 — rebuild reasoning as math_only. The persisted reasoning
      // and the "Why you" line must reflect what actually happened (math
      // fallback), not the discarded tiebreaker. Re-derive from the
      // ranked top-1 since that's what the fallback path will land on.
      reasoning = {
        kind: 'math_only',
        mathScore: ranked[0]?.score ?? 0,
        mathBreakdown: ranked[0]?.breakdown ?? {
          skillOverlap: 0,
          fitForKind: 0,
          availabilityNow: 0,
          loadHeadroom: 0,
          interestNudge: 0,
        },
      };
    }
  }

  // If the judge pick is absent / invalid / excluded, fall back to math
  // top-1 using the already-computed `ranked` list from Pass 1. This avoids
  // re-running rankMatches in Pass 3 (and avoids a fresh per-task DB read
  // for the schedule lookup when the ranking is already cached).
  let best: ScheduledMatch | null = null;
  if (chosenMatch) {
    const plan = await buildSchedulePlan(task, chosenMatch.teammate);
    if (plan) {
      const combinedScore =
        chosenMatch.score * 0.72 + scheduleTimelinessScore(plan) * 0.28;
      best = { match: chosenMatch, plan, combinedScore };
    }
  }

  // Math top-1 fallback walks the pre-ranked list (already filtered by
  // MIN_FIT_SCORE in rankMatches) and picks the first candidate with a
  // valid schedule plan. Excluded teammates skipped on this pass.
  if (!best) {
    best = await pickScheduledFromRanked(task, ranked, excluded);
  }

  // Second pass: if no compatible candidate, retry without exclusions before
  // we fall through to the owner. This catches the case where the only
  // possible assignee was the decliner — better the owner sees it than
  // the task get bounced right back to them.
  if (!best && excluded.size > 0) {
    best = await pickScheduledFromRanked(task, ranked, new Set());
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
      await assignScheduledTask(task, ownerTeammate.id, 'recgon', ownerPlan, reasoning);
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
        notifyTeammateAssigned({
          teammate: full,
          task: withPlan(task, ownerPlan),
          teamName,
          reasoning,
        }).catch((err) => {
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

  await assignScheduledTask(task, best.match.teammate.id, 'recgon', best.plan, reasoning);
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
    notifyTeammateAssigned({
      teammate: full,
      task: withPlan(task, best.plan),
      teamName,
      reasoning,
    }).catch((err) => {
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
  return pickScheduledFromRanked(task, ranked, new Set());
}

/**
 * Same schedule-aware best-match logic, but starts from an already-ranked
 * list (Pass 1 output). Lets Pass 3 use the Pass 1 ranking directly without
 * re-invoking rankMatches — critical for the integration test (which sets
 * a fixed mockReturnValueOnce queue) and for runtime efficiency.
 */
async function pickScheduledFromRanked(
  task: AgentTask,
  ranked: MatchResult[],
  excluded: Set<string>,
): Promise<ScheduledMatch | null> {
  const schedulable: ScheduledMatch[] = [];
  for (const match of ranked) {
    if (excluded.has(match.teammate.id)) continue;
    const plan = await buildSchedulePlan(task, match.teammate);
    if (!plan) continue;
    const combinedScore =
      match.score * 0.72 + scheduleTimelinessScore(plan) * 0.28;
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
  reasoning?: AssignmentReasoning,
): Promise<void> {
  await assignTask(
    task.id,
    teammateId,
    assignedBy,
    null,
    {
      scheduledDate: plan.scheduledDate,
      deadline: plan.deadline,
      scheduleNote: plan.scheduleNote,
    },
    reasoning,
  );
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

// Used by tests and by the manual /recgon/dispatch route. Collapses to a
// degenerate N=1 case of `runDispatch`'s 3-pass flow — same `runJudgment`
// path, same cap check, same `dispatchSingleTaskWithReasoning` — so QUAL-03
// behaviour is identical on the cron and the manual path.
export async function dispatchTask(
  teamId: string,
  taskId: string,
  options: { excludeTeammateIds?: string[] } = {},
): Promise<'assigned' | 'no_fit' | 'skip'> {
  const rawTask = await getTask(taskId);
  if (!rawTask || rawTask.status !== 'unassigned') return 'skip';

  const teammates = await listTeammatesWithStats(teamId);
  // PROFILE-04 + SKILL-04: same merge as runDispatch so the manual single-task
  // path (user-created tasks, decliner re-dispatch) matches the cron behavior.
  const profiles = await listProfiles(teamId);
  const inferredByTeammate = await listActiveInferredSkillsForTeam(teamId);
  const mergedTeammates = applyProfileMerge(teammates, profiles, inferredByTeammate);
  const excludeIds = options.excludeTeammateIds ?? [];
  const excluded = new Set(excludeIds);
  const candidatePool = mergedTeammates.filter((t) => !excluded.has(t.id));

  // ── Pass 1 (N=1): rank this single task ─────────────────────────────────
  const fresh = await ensureFreshSkills(rawTask);
  const r = rankMatches(candidatePool, {
    kind: fresh.kind,
    requiredSkills: fresh.requiredSkills,
    estimatedHours: fresh.estimatedHours,
    priority: fresh.priority,
  });
  const isCloseCall = r.length >= 2 && r[0].score - r[1].score < CLOSE_CALL_THRESHOLD;
  const entry: RankEntry = { task: fresh, ranked: r, isCloseCall };

  // ── Pass 2 (N=1): same judge helper, same cache, same cap ───────────────
  // Cache is per-call; for the manual path the cache holds at most 1 entry
  // and is dropped on return — that's fine, the production payoff is in
  // `runDispatch`'s cross-task amortization.
  const cache = new Map<string, JudgePick>();
  const judgeMap = await applyJudgmentIfClose(
    isCloseCall ? [entry] : [],
    { teamId, cache, chat: chatViaProviders },
  );
  const pick = judgeMap.get(fresh.id) ?? null;
  const reasoning = buildAssignmentReasoning(entry, pick);

  // ── Pass 3 (N=1): assign with the chosen match + reasoning envelope ─────
  return dispatchSingleTaskWithReasoning(
    teamId,
    fresh,
    r,
    pick,
    reasoning,
    mergedTeammates,
    excludeIds,
  );
}
