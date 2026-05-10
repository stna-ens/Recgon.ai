import type { AgentTask, Teammate, Weekday, WorkingHours } from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_HORIZON_DAYS = 21;

// Sun..Sat → weekday key (matches Date#getUTCDay())
const WEEKDAY_BY_UTC_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type SchedulePlan = {
  scheduledDate: string; // YYYY-MM-DD (UTC date)
  deadline: string;      // ISO datetime — end of scheduledDate (back-compat)
  scheduleNote: string;
};

function defaultWorkingHours(): WorkingHours {
  return { days: ['mon', 'tue', 'wed', 'thu', 'fri'] };
}

function effectiveWorkingDays(teammate: Pick<Teammate, 'workingHours'>): Weekday[] {
  return teammate.workingHours?.days ?? defaultWorkingHours().days;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcWeekday(date: Date): Weekday {
  return WEEKDAY_BY_UTC_INDEX[date.getUTCDay()];
}

function taskHours(task: Pick<AgentTask, 'estimatedHours'>): number {
  return Math.max(0.25, Number(task.estimatedHours) || 1);
}

function priorityDailyMultiplier(priority?: number): number {
  if (priority !== undefined && priority <= 0) return 1.5;
  if (priority === 1) return 1.2;
  return 1;
}

function dailyCapacityHours(
  teammate: Pick<Teammate, 'capacityHours' | 'workingHours'>,
  workingDays: Weekday[],
): number {
  const cap = Number(teammate.capacityHours) || 1;
  return Math.max(0.5, cap / Math.max(1, workingDays.length));
}

// Pick the first working day from `now` that has enough remaining capacity to
// fit the task, respecting the task deadline. `loadByDate` lets the caller
// pass already-scheduled hours per UTC date for this teammate so the planner
// doesn't overload a day.
export function planTaskSchedule(input: {
  teammate: Pick<Teammate, 'capacityHours' | 'workingHours'>;
  task: Pick<AgentTask, 'estimatedHours' | 'deadline' | 'priority' | 'title'>;
  loadByDate?: Record<string, number>;
  now?: Date;
  horizonDays?: number;
}): SchedulePlan | null {
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const workingDays = effectiveWorkingDays(input.teammate);
  if (workingDays.length === 0) return null;

  const dailyBudget =
    dailyCapacityHours(input.teammate, workingDays) * priorityDailyMultiplier(input.task.priority);
  const taskHrs = taskHours(input.task);
  const deadline = input.task.deadline ? new Date(input.task.deadline) : null;
  const load = input.loadByDate ?? {};

  for (let i = 0; i <= horizonDays; i++) {
    const candidate = addUtcDays(now, i);
    if (!workingDays.includes(utcWeekday(candidate))) continue;
    const key = dayKey(candidate);
    const dayEnd = new Date(`${key}T23:59:59Z`);
    if (deadline && dayEnd > deadline) break;
    const used = load[key] ?? 0;
    if (used + taskHrs <= dailyBudget) {
      const noteHrs = taskHrs.toFixed(taskHrs % 1 === 0 ? 0 : 1);
      return {
        scheduledDate: key,
        deadline: dayEnd.toISOString(),
        scheduleNote: `${noteHrs}h reserved on ${key} from this teammate's daily capacity.`,
      };
    }
  }

  // Fallback: no day with free capacity; pick the earliest working day that
  // still fits before the deadline (or the first working day in the horizon).
  for (let i = 0; i <= horizonDays; i++) {
    const candidate = addUtcDays(now, i);
    if (!workingDays.includes(utcWeekday(candidate))) continue;
    const key = dayKey(candidate);
    const dayEnd = new Date(`${key}T23:59:59Z`);
    if (deadline && dayEnd > deadline) break;
    const noteHrs = taskHrs.toFixed(taskHrs % 1 === 0 ? 0 : 1);
    return {
      scheduledDate: key,
      deadline: dayEnd.toISOString(),
      scheduleNote: `${noteHrs}h reserved on ${key} (above teammate's daily capacity — needs review).`,
    };
  }
  return null;
}

export function scheduleTimelinessScore(
  plan: SchedulePlan,
  now: Date = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS,
): number {
  const target = new Date(`${plan.scheduledDate}T23:59:59Z`).getTime();
  const daysUntilDone = Math.max(0, target - now.getTime()) / DAY_MS;
  return Math.max(0, Math.min(1, 1 - daysUntilDone / Math.max(1, horizonDays)));
}

export const __testing = {
  defaultWorkingHours,
  planTaskSchedule,
  scheduleTimelinessScore,
};
