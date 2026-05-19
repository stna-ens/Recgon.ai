// Recgon — pure overdue-policy decision function.
//
// Phase 3.6 Plan 02. Sibling to `match.ts` and `judge.ts`: takes a snapshot
// of the relevant task fields plus today's clock and returns ONE action
// (`nudge_teammate` | `escalate_to_owner` | `auto_reschedule` | `none`).
// Zero I/O, zero LLM calls, zero Supabase calls — Plan 03 wires the side
// effects on top of this brain.
//
// Decision tree (in order, short-circuit on the first match):
//   1. Task not assigned to a teammate → none.
//   2. Status not in ACTIVE_OVERDUE_STATUSES (terminal or unassigned) → none.
//   3. No scheduled_date → none (backfillLegacySchedules handles those).
//   4. Team feature flag off → none.
//   5. overdue = daysOverdue(scheduledUntilDate ?? scheduledDate, today) <= 0
//      → none (not yet overdue / due today).
//   6. lastOverdueActionAt within last 24h → none (cool-down).
//   7. Compute target tier from days-overdue band:
//        [1, 2]  → 1 (nudge_teammate)
//        [3, 6]  → 2 (escalate_to_owner)
//        7+      → 3 (auto_reschedule)
//   8. NO-SKIP: cap target at task.overdueTier + 1. A tier-0 task that
//      crosses straight into the 7-day band still gets a tier-1 nudge
//      first; the next sweep moves it to tier 2; the one after to tier 3.
//
// Source MUST NOT contain `new Date()` or `Date.now()` — the cron passes
// `today` in; tests inject deterministic fixtures.

import type { AgentTask, OverdueAction } from './types';

// Tasks in these statuses are eligible for overdue pressure. Terminal
// statuses (completed/declined/failed/cancelled) and `unassigned` are
// deliberately excluded — unassigned tasks are the dispatcher's job, not
// the overdue sweep's.
export const ACTIVE_OVERDUE_STATUSES = [
  'assigned',
  'accepted',
  'in_progress',
  'awaiting_review',
] as const;

export type OverdueDecisionInput = {
  task: Pick<
    AgentTask,
    | 'id'
    | 'status'
    | 'scheduledDate'
    | 'scheduledUntilDate'
    | 'assignedTo'
  > & {
    overdueTier: 0 | 1 | 2 | 3;
    lastOverdueActionAt: string | null;
  };
  teamOverduePressureEnabled: boolean;
  today: Date;
};

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Parse a YYYY-MM-DD key into the UTC midnight epoch ms it represents.
// Returns NaN for malformed input so callers can defensively short-circuit
// — though the type system already forbids passing arbitrary strings here.
function dateKeyToUtcMs(key: string): number {
  // `Date.parse('YYYY-MM-DD')` is spec-defined to anchor at UTC midnight.
  return Date.parse(`${key}T00:00:00Z`);
}

// UTC date key for a Date. Matches scheduler.ts conventions.
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Integer day delta between `today` and `scheduledEndKey`.
 *
 *   > 0  → overdue by that many days
 *   = 0  → due today
 *   < 0  → due in the future
 *
 * Both sides are normalised to UTC midnight before subtracting, so partial
 * days never bleed into the answer.
 */
export function daysOverdue(scheduledEndKey: string, today: Date): number {
  const scheduledMs = dateKeyToUtcMs(scheduledEndKey);
  const todayMs = dateKeyToUtcMs(utcDateKey(today));
  if (Number.isNaN(scheduledMs) || Number.isNaN(todayMs)) return 0;
  return Math.round((todayMs - scheduledMs) / DAY_MS);
}

/**
 * Derived helper for the UI (Plan 04). Returns true iff the policy would
 * consider the task in an overdue band right now, ignoring tier/cool-down
 * (those gate the *action*, not the *state*).
 */
export function isOverdue(
  task: Pick<AgentTask, 'status' | 'scheduledDate' | 'scheduledUntilDate' | 'assignedTo'>,
  today: Date,
): boolean {
  if (task.assignedTo == null) return false;
  if (!isActiveStatus(task.status)) return false;
  const endKey = task.scheduledUntilDate ?? task.scheduledDate;
  if (endKey == null) return false;
  return daysOverdue(endKey, today) > 0;
}

function isActiveStatus(status: AgentTask['status']): boolean {
  return (ACTIVE_OVERDUE_STATUSES as readonly string[]).includes(status);
}

function targetTierFromOverdue(overdue: number): 1 | 2 | 3 {
  if (overdue >= 7) return 3;
  if (overdue >= 3) return 2;
  return 1; // overdue is guaranteed >= 1 by the caller
}

function tierToAction(tier: 1 | 2 | 3): OverdueAction {
  if (tier === 1) return { kind: 'nudge_teammate', tier: 1 };
  if (tier === 2) return { kind: 'escalate_to_owner', tier: 2 };
  return { kind: 'auto_reschedule', tier: 3 };
}

/**
 * Core policy. See the file-level comment for the decision tree.
 */
export function decideOverdueAction(input: OverdueDecisionInput): OverdueAction {
  const { task, teamOverduePressureEnabled, today } = input;

  // Gate 1 — unassigned tasks aren't overdue, they're a dispatcher problem.
  if (task.assignedTo == null) return { kind: 'none' };

  // Gate 2 — terminal status / `unassigned` short-circuits.
  if (!isActiveStatus(task.status)) return { kind: 'none' };

  // Gate 3 — no scheduled_date means backfillLegacySchedules owns this row.
  if (task.scheduledDate == null) return { kind: 'none' };

  // Gate 4 — per-team kill switch.
  if (!teamOverduePressureEnabled) return { kind: 'none' };

  // Gate 5 — measure overdue from the end of the (possibly multi-day) window.
  const endKey = task.scheduledUntilDate ?? task.scheduledDate;
  const overdue = daysOverdue(endKey, today);
  if (overdue <= 0) return { kind: 'none' };

  // Gate 6 — 24h per-task cool-down. The cron runs daily, so this is mostly
  // belt-and-suspenders: it makes the function safe to call from ad-hoc
  // tooling (`/api/cron/overdue-sweep` invoked manually mid-day) without
  // double-actioning.
  if (task.lastOverdueActionAt != null) {
    const lastMs = Date.parse(task.lastOverdueActionAt);
    if (!Number.isNaN(lastMs)) {
      const elapsed = today.getTime() - lastMs;
      if (elapsed < COOLDOWN_MS) return { kind: 'none' };
    }
  }

  // Gate 7 — band → target tier.
  const bandTier = targetTierFromOverdue(overdue);

  // Gate 8 — no-skip clamp. A task that was last actioned at tier 0 can
  // emit tier 1 but never tier 2 or 3 in the same sweep, even if it's
  // suddenly 8 days overdue (weekend cron skip, holiday, etc.).
  const maxAllowed = (task.overdueTier + 1) as 1 | 2 | 3 | 4;
  const tier = (Math.min(bandTier, maxAllowed) as 1 | 2 | 3);

  return tierToAction(tier);
}
