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
