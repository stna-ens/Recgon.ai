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
import { pickBestMatch } from './match';
import {
  listTeammatesWithStats,
  listUnassignedTasks,
  assignTask,
  appendAssignmentLog,
  saveBrainSnapshot,
  logEvent,
  getTask,
  getTeammate,
} from './storage';
import type { AgentTask, AssignmentLogEntry, BrainSnapshot } from './types';

async function getTeamName(teamId: string): Promise<string> {
  const { data } = await supabase.from('teams').select('name').eq('id', teamId).maybeSingle();
  return (data?.name as string) ?? 'your team';
}

export type DispatchResult = {
  brainSnapshot: BrainSnapshot;
  minted: number;
  skipped: number;
  assigned: number;
  noFit: number;
};

export async function runDispatch(teamId: string): Promise<DispatchResult> {
  const snapshot = await readUnifiedBrain(teamId);
  await saveBrainSnapshot(teamId, snapshot);
  const { minted, skipped } = await mintTasksFromBrain(teamId, snapshot);

  // Score against the full unassigned backlog, not just freshly minted, so
  // user-created tasks get picked up too.
  const backlog = await listUnassignedTasks(teamId);
  const teammates = await listTeammatesWithStats(teamId);

  let assigned = 0;
  let noFit = 0;

  for (const task of backlog) {
    const result = await dispatchSingleTask(teamId, task, teammates);
    if (result === 'assigned') assigned++;
    else if (result === 'no_fit') noFit++;
  }

  logger.info('recgon dispatch complete', {
    teamId,
    minted: minted.length,
    skipped,
    assigned,
    noFit,
  });

  return {
    brainSnapshot: snapshot,
    minted: minted.length,
    skipped,
    assigned,
    noFit,
  };
}

async function dispatchSingleTask(
  teamId: string,
  task: AgentTask,
  teammates: Awaited<ReturnType<typeof listTeammatesWithStats>>,
  excludeIds: string[] = [],
): Promise<'assigned' | 'no_fit' | 'skip'> {
  const excluded = new Set(excludeIds);
  // First pass: respect exclusions (e.g. the teammate who just declined).
  const candidatePool = teammates.filter((t) => !excluded.has(t.id));
  let best = pickBestMatch(candidatePool, {
    kind: task.kind,
    requiredSkills: task.requiredSkills,
    estimatedHours: task.estimatedHours,
    priority: task.priority,
  });

  // Second pass: if no compatible candidate, retry without exclusions before
  // we fall through to the owner. This catches the case where the only
  // possible assignee was the decliner — better the owner sees it than
  // the task get bounced right back to them.
  if (!best && excluded.size > 0) {
    best = pickBestMatch(teammates, {
      kind: task.kind,
      requiredSkills: task.requiredSkills,
      estimatedHours: task.estimatedHours,
      priority: task.priority,
    });
  }

  // Final fallback: assign to the team owner so they can decide. We do this
  // instead of leaving the task unassigned because Recgon found nobody who
  // scored well — this is exactly when a human needs to weigh in.
  if (!best) {
    const ownerTeammate = teammates.find(
      (t) => t.teamRole === 'owner' && t.kind !== 'ai' && t.status === 'active' && !excluded.has(t.id),
    ) ?? teammates.find((t) => t.teamRole === 'owner' && t.kind !== 'ai' && t.status === 'active');
    if (ownerTeammate) {
      await assignTask(task.id, ownerTeammate.id, 'recgon', null);
      await logEvent({
        teamId,
        teammateId: ownerTeammate.id,
        taskId: task.id,
        event: 'assigned',
        payload: { reason: 'owner_fallback', kind: task.kind, requiredSkills: task.requiredSkills },
      });
      const [teamName, full] = await Promise.all([
        getTeamName(teamId),
        getTeammate(ownerTeammate.id),
      ]);
      if (full) {
        notifyTeammateAssigned({ teammate: full, task, teamName }).catch((err) => {
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
        reason: 'owner_fallback',
        ts: new Date().toISOString(),
      });
      return 'assigned';
    }

    await logEvent({
      teamId,
      taskId: task.id,
      event: 'no_fit',
      payload: { kind: task.kind, requiredSkills: task.requiredSkills },
    });
    await appendAssignmentLog(teamId, {
      taskId: task.id,
      taskTitle: task.title,
      teammateId: null,
      teammateName: null,
      score: 0,
      reason: 'no_fit',
      ts: new Date().toISOString(),
    });
    return 'no_fit';
  }

  await assignTask(task.id, best.teammate.id, 'recgon', null);
  await logEvent({
    teamId,
    teammateId: best.teammate.id,
    taskId: task.id,
    event: 'assigned',
    payload: { score: best.score, breakdown: best.breakdown },
  });

  // Email + in-app notification for the assignee.
  const [teamName, full] = await Promise.all([
    getTeamName(teamId),
    getTeammate(best.teammate.id),
  ]);
  if (full) {
    notifyTeammateAssigned({ teammate: full, task, teamName }).catch((err) => {
      logger.warn('notify teammate failed', {
        taskId: task.id,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  const logEntry: AssignmentLogEntry = {
    taskId: task.id,
    taskTitle: task.title,
    teammateId: best.teammate.id,
    teammateName: best.teammate.displayName,
    score: Number(best.score.toFixed(3)),
    reason: 'best_fit',
    ts: new Date().toISOString(),
  };
  await appendAssignmentLog(teamId, logEntry);
  return 'assigned';
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
  return dispatchSingleTask(teamId, task, teammates, options.excludeTeammateIds ?? []);
}
