// Phase 4 Plan 03 — fire-and-forget `task_reframe` enqueue helper.
//
// This is a TINY leaf module that sits between `storage.ts` and `reframe.ts`
// so that `reassignTask` (Plan 03 / Task 3.1) and the dispatcher
// (Plan 01 / Task 1.3) can both enqueue a new `task_reframe` job WITHOUT
// creating an import cycle.
//
// Dependency direction:
//
//   storage.ts ──► reframeEnqueue.ts ──► jobQueue + storage.getTeammate
//   dispatcher.ts ─►                ─► (same)
//   reframe.ts ──► reframeEnqueue.ts (re-export only; for grep-discoverability)
//
// `reframe.ts` re-exports `enqueueReframeJob` so historic call sites that
// import it from `./reframe` continue to work, and AC #1 of Plan 04-03
// (grep -c "enqueueReframeJob" reframe.ts ≥ 1) passes. The actual definition
// lives here in this leaf so we don't drag the LLM SDK into `storage.ts`'s
// transitive deps.
//
// FRAME-01 contract: fire-and-forget. A failed enqueue must NEVER roll back
// the assignment/reassignment. All errors are caught + logged at warn level.

import { logger } from '../logger';
import { enqueueJob } from '../llm/jobQueue';
import { getTeammate } from './storage';

/**
 * Enqueue exactly one `task_reframe` job for the new assignee.
 *
 * Resolves teammate → userId (since `agent_tasks.assigned_to` stores
 * teammateIds, not userIds). Skips silently when the teammate has no
 * userId — legacy non-user teammates (kind='ai' or pre-Plan-1 manual rows)
 * cannot be personalized for because the column ties to a userId.
 *
 * Single source of truth for both:
 *   - `dispatcher.ts` (after assignTask in both assignScheduledTask paths)
 *   - `storage.ts::reassignTask` (after the supabase update, when a new
 *     assignee is set and the assignment actually changed)
 *
 * Fire-and-forget. Any thrown error is swallowed + logged. The caller must
 * NOT roll back the assignment on enqueue failure.
 */
export async function enqueueReframeJob(
  taskId: string,
  assigneeTeammateId: string,
  teamId: string,
): Promise<void> {
  let userId: string | null = null;
  try {
    const teammate = await getTeammate(assigneeTeammateId);
    userId = teammate?.userId ?? null;
  } catch (err) {
    logger.warn('task_reframe: getTeammate failed (skipping enqueue)', {
      taskId,
      assigneeTeammateId,
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!userId) {
    // Legacy non-user teammate (kind='ai' or pre-Plan-1 manual rows) has no
    // userId to personalize for. Skip silently — no reframe possible.
    logger.debug('task_reframe skipped — teammate has no userId', {
      taskId,
      assigneeTeammateId,
    });
    return;
  }
  try {
    await enqueueJob({
      teamId,
      userId,
      kind: 'task_reframe',
      payload: { taskId, assigneeUserId: userId, teamId },
    });
  } catch (err) {
    logger.warn('task_reframe enqueue failed', {
      taskId,
      assigneeUserId: userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
