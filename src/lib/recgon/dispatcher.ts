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
): Promise<'assigned' | 'no_fit' | 'skip'> {
  const best = pickBestMatch(teammates, {
    kind: task.kind,
    requiredSkills: task.requiredSkills,
    estimatedHours: task.estimatedHours,
    priority: task.priority,
  });

  if (!best) {
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
export async function dispatchTask(teamId: string, taskId: string): Promise<'assigned' | 'no_fit' | 'skip'> {
  const task = await getTask(taskId);
  if (!task || task.status !== 'unassigned') return 'skip';
  const teammates = await listTeammatesWithStats(teamId);
  return dispatchSingleTask(teamId, task, teammates);
}
