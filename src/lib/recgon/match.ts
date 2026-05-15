// Recgon matching — score each teammate for a given task and pick the best.
//
// base score = 0.45 * skillOverlap
//            + 0.30 * fitForKind
//            + 0.15 * availabilityNow
//            + 0.10 * loadHeadroom
//
// Then the skillOverlap term is multiplied by `skillWeight()` (in [0.5, 1.5])
// so a teammate's recent track record on the task's required skills biases
// the match. Bounded so newcomers aren't shut out and one bad rating doesn't
// tank a strong teammate.
//
// Below MIN_FIT_SCORE the task falls to the team owner so a human picks.
// Set high enough that an empty-skills random match doesn't squeak by.

import { skillWeight } from './fitLearning';
import type { AgentTask, BrainEntry, Teammate, TeammateWithStats, WorkingHours } from './types';

// Why 0.4: with empty teammate skills the prior code scored ~0.45 from
// availability + load + newcomer-fit alone, so 0.25 was effectively "anyone
// goes". 0.4 means at least one of {real skill overlap, established fit
// record} must contribute, otherwise the task bubbles to the owner.
export const MIN_FIT_SCORE = 0.4;

// Phase 3 / Plan 06 — refusal + deferral constants.
//
// SIGNAL_FLOOR is a SECOND gate on top of MIN_FIT_SCORE. MIN_FIT_SCORE
// filters the overall weighted-sum score (which can be reached via
// availability + load alone). SIGNAL_FLOOR filters by per-signal grounding:
// at least one of {skillOverlap, fitForKind, interestNudge} — the FIT
// signals — must clear it. Availability and load are deliberately EXCLUDED
// here because the user's product rule (2026-05-15) is that Recgon must
// NEVER assign a task to someone just because they had time:
//   "the recgon should NEVER EVER assign a task to someone because nobody
//   else had time. If the task has nobody to do it because they are
//   scheduled, it just should be assigned to a further time"
// So a candidate with availabilityNow=1.0 + zero fit signals does not
// qualify under hasMinimumFit. Same rule covers Gap 1 (zero-signal refusal).
export const SIGNAL_FLOOR = 0.15;

// DEFER_FLOOR is the per-candidate availability floor used in the deferral
// branch. When ALL qualified candidates (passed hasMinimumFit) have
// availabilityNow < DEFER_FLOOR right now, the task is DEFERRED — its
// scheduledDate moves forward instead of being dumped on a less-qualified
// teammate who happened to be free.
export const DEFER_FLOOR = 0.3;

// DEFER_LOOKAHEAD_WEEKS bounds the deferral scan. The dispatcher scans
// week-by-week from today through this many weeks ahead looking for the
// earliest opening; if no qualified candidate hits DEFER_FLOOR within
// the window, the task triages with `no_capacity_in_window` instead so
// the owner sees that the team is consistently slammed.
export const DEFER_LOOKAHEAD_WEEKS = 4;

// HIGH_PRIORITY_THRESHOLD switches the booked-qualified branch from
// deferral to immediate triage. Priority >= 3 bypasses the deferral path
// entirely (high-prio tasks can't sit waiting for a week's opening).
// Priority 0..2 defer normally.
export const HIGH_PRIORITY_THRESHOLD = 3;

const W_SKILL = 0.45;
const W_FIT = 0.30;
const W_AVAIL = 0.15;
const W_LOAD = 0.10;

// D-03 / Pitfall 3: interest-nudge is the ONLY allowed math touch in Phase 1.
// Applied AFTER the weighted sum as an additive term — never as one of the
// four weighted components — so a small overlap on interests can break a tie
// between similarly-skilled candidates but CANNOT flip a strictly better-
// skilled candidate. ≤ 0.05 hard cap. Starting value 0.03 leaves room and
// respects Pitfall 3 (skill-first selection).
const INTEREST_NUDGE_WEIGHT = 0.03;

// Words tokenizing out of `teammate.title` that don't say anything about role.
const TITLE_STOPWORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'of', 'for', 'to', 'with', 'in', 'at',
  'team', 'teammate', 'member', 'owner', 'lead', 'senior', 'junior', 'staff',
  'principal', 'head', 'chief', 'co', 'mr', 'ms', 'mrs',
]);

// Shallow alias map so "social media" → social_media tag the LLM also emits.
const TITLE_ALIASES: Record<string, string> = {
  dev: 'engineering',
  developer: 'engineering',
  engineer: 'engineering',
  programmer: 'engineering',
  coder: 'engineering',
  back: 'backend',
  frontend: 'frontend',
  front: 'frontend',
  fullstack: 'engineering',
  designer: 'design',
  marketer: 'marketing',
  growth: 'growth',
  social: 'social_media',
  media: 'social_media',
  pm: 'product',
  ceo: 'strategy',
  cto: 'engineering',
  founder: 'strategy',
  support: 'customer_support',
  customer: 'customer_support',
  qa: 'qa',
  tester: 'qa',
  finance: 'finance',
  ops: 'operations',
  sales: 'sales',
  data: 'analytics',
  analyst: 'analytics',
  research: 'research',
  researcher: 'research',
  copy: 'copywriting',
  writer: 'content_writing',
  content: 'content_writing',
};

function tokenizeTitle(title: string | undefined | null): string[] {
  if (!title) return [];
  // "Tester, Finance, Back-End Dev" → ["tester","finance","back","end","dev"]
  const tokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !TITLE_STOPWORDS.has(t));
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(TITLE_ALIASES[t] ?? t);
  }
  // Compound: "social media" / "back end" handled via the alias on each word.
  return [...out];
}

function teammateSkillSet(teammate: Pick<Teammate, 'skills' | 'title'>): string[] {
  const explicit = (teammate.skills ?? []).map((s) => s.toLowerCase());
  const fromTitle = tokenizeTitle(teammate.title);
  return [...new Set([...explicit, ...fromTitle])];
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0.5; // no signal — neutral
  if (a.length === 0 || b.length === 0) return 0.1;
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  sa.forEach((x) => {
    if (sb.has(x)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function fitForKind(teammate: Teammate, kind: string): number {
  const score = teammate.fitProfile?.taskKindScores?.[kind];
  if (typeof score !== 'number') return 0.5; // newcomer — neutral, gets tried
  // EMA stored in [-1, 1] → normalise to [0, 1].
  return Math.max(0, Math.min(1, (score + 1) / 2));
}

// Day-precision availability: does the teammate work on `now`'s UTC weekday?
// Hour-of-day was removed when the calendar moved to day granularity.
const WEEKDAY_BY_UTC_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function isWorkingDay(wh: WorkingHours | null, now: Date = new Date()): boolean {
  if (!wh) return true; // null = always available
  const wd = WEEKDAY_BY_UTC_INDEX[now.getUTCDay()];
  return wh.days.includes(wd);
}

function availabilityNow(teammate: Teammate, now: Date = new Date()): number {
  return isWorkingDay(teammate.workingHours, now) ? 1 : 0.3;
}

function loadHeadroom(inFlightHours: number, capacityHours: number, taskHours: number): number {
  const headroom = 1 - (inFlightHours + taskHours) / Math.max(1, capacityHours);
  return Math.max(0, Math.min(1, headroom));
}

// Fallback when real summed hours aren't available (legacy callers / tests
// that pass only `inFlightCount`). Same constant the placeholder used.
const FALLBACK_HOURS_PER_TASK = 1.5;

export type Scoreable =
  | TeammateWithStats
  | (Teammate & { inFlightCount?: number; inFlightHours?: number });

export type MatchInput = Pick<AgentTask, 'kind' | 'requiredSkills' | 'estimatedHours'> &
  Partial<Pick<AgentTask, 'priority'>>;

export type MatchResult = {
  teammate: Scoreable;
  score: number;
  breakdown: {
    skillOverlap: number;
    fitForKind: number;
    availabilityNow: number;
    loadHeadroom: number;
    // D-03 / Phase 1: additive nudge applied AFTER the weighted sum. Reported
    // separately in the breakdown so callers can inspect / debug ties; the
    // top-level `score` already includes this. 0 when teammate has no
    // matching interest (or no `interests` field at all — back-compat).
    interestNudge: number;
  };
};

export function scoreTeammateForTask(
  teammate: Scoreable,
  task: MatchInput,
  now: Date = new Date(),
): MatchResult {
  // Union the teammate's explicit skills with role tokens parsed from their
  // job `title`. This way a teammate with `title: "Social Media"` and an
  // empty `skills[]` still gets recognized as the social-media person.
  const teammateSkills = teammateSkillSet(teammate);
  const baseSkillOverlap = jaccard(task.requiredSkills ?? [], teammateSkills);
  // Per-skill learning: weight the skill score by the teammate's recent
  // track record on the specific skills this task needs. 1.0 = no signal.
  const weight = skillWeight(teammate.fitProfile, task.requiredSkills ?? []);
  const skillOverlap = Math.max(0, Math.min(1, baseSkillOverlap * weight));
  const fit = fitForKind(teammate, task.kind);
  const avail = availabilityNow(teammate, now);
  const stats = teammate as TeammateWithStats;
  // Prefer real summed in-flight hours from listTeammatesWithStats. Fall
  // back to count × rough-avg when hours weren't supplied (legacy callers,
  // unit tests). 0-hour aggregates are valid (no in-flight work) and must
  // not silently trigger the fallback — so we check `undefined`, not falsy.
  const inFlightHours =
    stats.inFlightHours !== undefined
      ? stats.inFlightHours
      : (stats.inFlightCount ?? 0) * FALLBACK_HOURS_PER_TASK;
  const load = loadHeadroom(inFlightHours, teammate.capacityHours, task.estimatedHours ?? 1);
  const baseScore =
    W_SKILL * skillOverlap +
    W_FIT * fit +
    W_AVAIL * avail +
    W_LOAD * load;

  // D-03 / Pitfall 3: additive interest-nudge — applied AFTER the weighted
  // sum, capped at INTEREST_NUDGE_WEIGHT (≤ 0.05). Cannot flip a strictly
  // better-skill candidate; only breaks ties between similarly-skilled
  // candidates. Reads `teammate.interests` if present (set by profileMerge);
  // back-compat for old callers without the field (undefined → 0 nudge).
  const candidateInterests =
    (teammate as Teammate & { interests?: string[] }).interests ?? [];
  const taskTags = [...(task.requiredSkills ?? [])].map((s) => s.toLowerCase());
  const interestOverlap = candidateInterests.some((i) =>
    taskTags.includes(i.toLowerCase()),
  )
    ? 1
    : 0;
  const interestNudge = interestOverlap * INTEREST_NUDGE_WEIGHT;
  const score = baseScore + interestNudge;

  return {
    teammate,
    score,
    breakdown: {
      skillOverlap,
      fitForKind: fit,
      availabilityNow: avail,
      loadHeadroom: load,
      interestNudge,
    },
  };
}

export function pickBestMatch(
  candidates: Scoreable[],
  task: MatchInput,
  now: Date = new Date(),
): MatchResult | null {
  // AI teammates are not dispatched to (the AI-doer side was removed).
  return rankMatches(candidates, task, now)[0] ?? null;
}

export function rankMatches(
  candidates: Scoreable[],
  task: MatchInput,
  now: Date = new Date(),
): MatchResult[] {
  const eligible = candidates.filter((c) => c.status === 'active');
  return eligible
    .map((c) => scoreTeammateForTask(c, task, now))
    .filter((r) => r.score >= MIN_FIT_SCORE)
    .sort((a, b) => b.score - a.score);
}

// Convenience for brain entries (same shape as AgentTask for matching purposes).
export function pickBestForBrainEntry(
  candidates: Scoreable[],
  entry: BrainEntry,
  now: Date = new Date(),
): MatchResult | null {
  return pickBestMatch(
    candidates,
    {
      kind: entry.kind,
      requiredSkills: entry.requiredSkills,
      estimatedHours: entry.estimatedHours,
      priority: entry.priority,
    },
    now,
  );
}

// ── Phase 3 / Plan 06 — refusal + deferral helpers ─────────────────────────

/**
 * FIT-signal floor check. TRUE iff at least one of the FIT signals
 * (skillOverlap | fitForKind | interestNudge) is >= SIGNAL_FLOOR.
 *
 * Availability and load are NOT FIT signals — they're tiebreakers. A
 * candidate who is 100% free but has zero overlap with the task does NOT
 * qualify, by user rule (see SIGNAL_FLOOR comment). The dispatcher uses
 * this to refuse to assign zero-signal tasks: when every candidate fails
 * hasMinimumFit, the task is triaged with `no_clear_fit` instead of
 * being assigned to whoever happens to have a free week.
 */
export function hasMinimumFit(breakdown: MatchResult['breakdown']): boolean {
  return (
    breakdown.skillOverlap >= SIGNAL_FLOOR ||
    breakdown.fitForKind >= SIGNAL_FLOOR ||
    breakdown.interestNudge >= SIGNAL_FLOOR
  );
}

// Monday-of-week helper. Given an arbitrary Date, returns a new Date set to
// 00:00 UTC of the Monday of that week. ISO weeks: Monday=1, Sunday=7.
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  // Distance back to Monday: Sun→-6, Mon→0, Tue→-1..Sat→-5.
  const offsetDays = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime());
  monday.setUTCDate(monday.getUTCDate() + offsetDays);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Per-candidate availability projection. Default reads the breakdown's
 * existing availabilityNow as the week-0 value and assumes the same number
 * for future weeks (best-effort fallback when no real calendar projection
 * is wired). Production deployments inject a real `projectionFn` that
 * queries the candidate's calendar `weekOffset` weeks ahead. Tests inject
 * a deterministic stub so date math is reproducible.
 */
export type CapacityProjectionFn = (
  candidateId: string,
  weekOffset: number,
) => number;

export type FindCapacityOpts = {
  now?: Date;
  projectionFn?: CapacityProjectionFn;
};

/**
 * Scans week-by-week from `now` through DEFER_LOOKAHEAD_WEEKS looking for
 * the earliest week where at least one qualified candidate's projected
 * availabilityNow is >= DEFER_FLOOR. Returns Monday of that week as a UTC
 * Date. Returns null if no opening exists in the window.
 *
 * Empty qualified[] → null (no one to wait for). Used by the dispatcher
 * deferral branch to compute the new scheduledDate.
 */
export function findEarliestCapacityWindow(
  qualified: MatchResult[],
  _task: AgentTask | MatchInput,
  opts: FindCapacityOpts = {},
): Date | null {
  if (qualified.length === 0) return null;
  const now = opts.now ?? new Date();
  // Default projection: trust the breakdown's availabilityNow for every
  // future week (no real calendar lookahead). This is the safety-net
  // behaviour; production callers should inject a real projectionFn.
  const projectionFn: CapacityProjectionFn =
    opts.projectionFn ??
    ((id) => {
      const match = qualified.find((q) => q.teammate.id === id);
      return match?.breakdown.availabilityNow ?? 0;
    });

  for (let weekOffset = 0; weekOffset <= DEFER_LOOKAHEAD_WEEKS; weekOffset++) {
    const anyOpen = qualified.some((q) => {
      const projected = projectionFn(q.teammate.id, weekOffset);
      return projected >= DEFER_FLOOR;
    });
    if (anyOpen) {
      const weekDate = new Date(now.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000);
      return mondayOf(weekDate);
    }
  }
  return null;
}

// ── Phase 3.5 / Plan 03.5-02 — owner-board capacity bar helpers ────────────
//
// The workload board shows two stacked weekly capacity bars per teammate
// (Wk 1 / Wk 2). These helpers feed those bars.

/**
 * Daily capacity hours for a teammate, derived from their weekly
 * `capacityHours` and the number of working days configured. Returns 0 if
 * either input is missing/zero.
 *
 * Mirrors the inline helper in `src/components/v2/calendar/SwimLane.tsx`;
 * exported here so the owner board (and future callers) can share the math
 * instead of redefining it.
 */
export function dailyCapacityHours(t: Pick<TeammateWithStats, 'capacityHours' | 'workingHours'>): number {
  const cap = Number(t.capacityHours) || 0;
  const days = t.workingHours?.days?.length ?? 7;
  return cap > 0 ? cap / Math.max(1, days) : 0;
}

/**
 * Weekly capacity hours for a teammate. Equal to
 * `dailyCapacityHours(t) * workingDaysPerWeek`.
 *
 * `workingDaysPerWeek` defaults to the length of `workingHours.days`, or 5
 * when working hours aren't configured. The fallback of 5 is the user's
 * stated 5-day-week assumption (CLAUDE.md / Recgon team norm).
 */
export function weeklyCapacityHours(t: Pick<TeammateWithStats, 'capacityHours' | 'workingHours'>): number {
  const workingDays = t.workingHours?.days?.length ?? 5;
  return dailyCapacityHours(t) * Math.max(1, workingDays);
}

/**
 * Sum the estimated hours of `tasks` whose `scheduledDate` falls within a
 * given week (`weekStartISO` inclusive, +6 days inclusive). Each task counts
 * its FULL estimatedHours toward the bar in the week it starts, regardless
 * of multi-day span — matches the simple model the UI presents.
 *
 * Insight-only tasks (sourceRef.kind === 'top_risk') are excluded — they
 * have no schedulable load.
 */
export function weeklyScheduledHours(
  tasks: Array<Pick<AgentTask, 'scheduledDate' | 'estimatedHours' | 'sourceRef' | 'assignedTo'>>,
  teammateId: string,
  weekStartISO: string,
): number {
  // Build the inclusive 7-day window keys.
  const start = new Date(`${weekStartISO}T00:00:00Z`);
  const keys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    keys.add(d.toISOString().slice(0, 10));
  }
  let total = 0;
  for (const task of tasks) {
    if (task.assignedTo !== teammateId) continue;
    if (!task.scheduledDate) continue;
    if (task.sourceRef && (task.sourceRef as { kind?: string }).kind === 'top_risk') continue;
    if (!keys.has(task.scheduledDate)) continue;
    total += Math.max(0, Number(task.estimatedHours) || 0);
  }
  return total;
}
