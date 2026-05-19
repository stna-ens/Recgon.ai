// Phase 3.6 / Plan 03 — Overdue-pressure side-effect dispatcher.
//
// Pairs with the pure `decideOverdueAction()` policy from Plan 02
// (`./overduePolicy.ts`). The policy is the brain; this module is the hands —
// it sends emails, writes event-log rows, and rewrites schedules. Keeping the
// two split means the policy stays unit-testable with zero I/O, and the
// sweep loop in `storage.ts` only has one entry point to call:
//
//   const action = decideOverdueAction({ task, ... });
//   if (action.kind !== 'none') {
//     await executeOverdueAction(task, action, teammate, owner, today);
//   }
//
// Tier → side effect map:
//   tier 1  nudge_teammate     → email assignee,            event 'nudged'
//   tier 2  escalate_to_owner  → email owner,               event 'escalated'
//   tier 3  auto_reschedule    → planTaskSchedule + email   event 'auto_rescheduled'
//                                (or reassignTask→null if no capacity)
//
// No LLM calls. Copy is deterministic literal templates in `prompts.ts`.

import type {
  AgentTask,
  OverdueAction,
  TeammateWithStats,
  OverdueTier,
} from './types';
import { daysOverdue } from './overduePolicy';
import { planTaskSchedule } from './scheduler';
import {
  loadHoursByDateForTeammate,
  loadHoursByDateForUser,
  markOverdueAction,
  reassignTask,
  setTaskSchedule,
} from './storage';
import {
  sendOverdueNudge,
  sendOverdueEscalation,
  sendAutoReschedulNotice,
} from '../email';
import { logger, logOverdueCounter } from '../logger';

export type OverdueOwner = {
  userId: string;
  email: string | null;
  nickname: string | null;
};

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
}

function taskUrl(teamId: string): string {
  // Tasks UI deep-links to the team workspace — Plan 04 will own the exact
  // task-detail anchor. For now we deep-link to the team workspace so the
  // recipient lands in the right team and can find the task.
  return `${appBaseUrl()}/teams/${teamId}`;
}

function endKeyOf(task: Pick<AgentTask, 'scheduledDate' | 'scheduledUntilDate'>): string | null {
  return task.scheduledUntilDate ?? task.scheduledDate;
}

// Shared `today` so we measure days-overdue and write `last_overdue_action_at`
// against the SAME clock the sweep used to decide. Avoids any drift where the
// policy says "1d" and the email says "2d" due to a midnight crossing
// mid-sweep.
export async function executeOverdueAction(
  task: AgentTask,
  action: OverdueAction,
  teammate: TeammateWithStats,
  owner: OverdueOwner,
  today: Date = new Date(),
): Promise<void> {
  if (action.kind === 'none') return;

  const endKey = endKeyOf(task);
  if (endKey == null) {
    // Defensive: policy already short-circuits on missing schedule, but if
    // some caller manages to invoke us with a null schedule we noop loudly
    // rather than fire a "0 days overdue" email.
    logger.warn('executeOverdueAction called with null schedule', { taskId: task.id });
    return;
  }
  const overdue = Math.max(1, daysOverdue(endKey, today));
  const url = taskUrl(task.teamId);

  if (action.kind === 'nudge_teammate') {
    const assigneeEmail = await getEmailForTeammate(teammate);
    if (assigneeEmail) {
      await sendOverdueNudge({
        to: assigneeEmail,
        taskTitle: task.title,
        daysOverdue: overdue,
        taskUrl: url,
      });
    } else {
      logger.debug('overdue_nudge skipped — no email for assignee', {
        teammateId: teammate.id,
      });
    }
    await markOverdueAction(task.id, 1, 'nudged', {
      teamId: task.teamId,
      teammateId: teammate.id,
      daysOverdue: overdue,
    });
    logOverdueCounter('nudged', { teamId: task.teamId, taskId: task.id });
    return;
  }

  if (action.kind === 'escalate_to_owner') {
    if (owner.email) {
      await sendOverdueEscalation({
        to: owner.email,
        assigneeName: teammate.displayName,
        taskTitle: task.title,
        daysOverdue: overdue,
        taskUrl: url,
      });
    } else {
      logger.debug('overdue_escalate skipped — no email for owner', {
        ownerUserId: owner.userId,
      });
    }
    await markOverdueAction(task.id, 2, 'escalated', {
      teamId: task.teamId,
      teammateId: teammate.id,
      ownerUserId: owner.userId,
      daysOverdue: overdue,
    });
    logOverdueCounter('escalated', { teamId: task.teamId, taskId: task.id });
    return;
  }

  if (action.kind === 'auto_reschedule') {
    // Build the load map the planner needs. Humans get cross-team
    // aggregation (a teammate's "Monday" is the union of every team's
    // Monday), AI/anon teammates fall back to per-teammate-id load.
    const fromDate = today.toISOString().slice(0, 10);
    const toDateCursor = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000);
    const toDate = toDateCursor.toISOString().slice(0, 10);
    const load = teammate.userId
      ? await loadHoursByDateForUser(teammate.userId, fromDate, toDate, task.id)
      : await loadHoursByDateForTeammate(teammate.id, fromDate, toDate, task.id);

    const plan = planTaskSchedule({
      teammate,
      task,
      loadByDate: load,
      now: today,
    });

    const originalDate = task.scheduledDate ?? endKey;

    if (plan) {
      await setTaskSchedule(task.id, {
        scheduledDate: plan.scheduledDate,
        scheduledUntilDate: null,
        deadline: plan.deadline,
        scheduleNote: `auto-rescheduled from ${originalDate} (was ${overdue}d overdue) — ${plan.scheduleNote}`,
      });
      const assigneeEmail = await getEmailForTeammate(teammate);
      if (assigneeEmail) {
        await sendAutoReschedulNotice({
          to: assigneeEmail,
          taskTitle: task.title,
          newDate: plan.scheduledDate,
          taskUrl: url,
        });
      }
      await markOverdueAction(task.id, 3, 'auto_rescheduled', {
        teamId: task.teamId,
        teammateId: teammate.id,
        previousScheduledDate: originalDate,
        newScheduledDate: plan.scheduledDate,
        daysOverdue: overdue,
      });
      logOverdueCounter('auto_rescheduled', { teamId: task.teamId, taskId: task.id });
      return;
    }

    // No capacity in the lookahead window — hand off to the dispatcher by
    // unassigning. The next dispatch cycle will rescue the task or
    // mark-for-triage if no one can take it.
    await reassignTask(task.id, null, 'recgon', {
      scheduleNote: `auto-rescheduled from ${originalDate} (was ${overdue}d overdue) — no capacity, returned to backlog`,
    });
    await markOverdueAction(task.id, 3, 'auto_rescheduled', {
      teamId: task.teamId,
      teammateId: teammate.id,
      previousScheduledDate: originalDate,
      newScheduledDate: null,
      daysOverdue: overdue,
      handoff: 'unassigned_no_capacity',
    });
    logOverdueCounter('auto_rescheduled', { teamId: task.teamId, taskId: task.id });
    return;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Resolve a teammate's email via their linked user. Mirrors the lookup in
// `notifications.ts` but kept local so this module doesn't import that file
// (avoids pulling the whyYou renderer chain into the cron path).
async function getEmailForTeammate(
  teammate: Pick<TeammateWithStats, 'userId'>,
): Promise<string | null> {
  if (!teammate.userId) return null;
  // Dynamic import keeps the supabase client out of the module-load graph
  // for environments (tests) that mock storage. Vitest's vi.mock targets
  // the static import name; this dynamic call resolves through the same
  // module so test stubs still apply.
  const { supabase } = await import('../supabase');
  const { data } = await supabase
    .from('users')
    .select('email')
    .eq('id', teammate.userId)
    .maybeSingle();
  const email = (data?.email as string | undefined) ?? null;
  return email;
}

// Re-exported for tests that want to assert the tier→event mapping without
// running the full runner.
export const TIER_TO_EVENT: Record<Exclude<OverdueTier, 0>, 'nudged' | 'escalated' | 'auto_rescheduled'> = {
  1: 'nudged',
  2: 'escalated',
  3: 'auto_rescheduled',
};
