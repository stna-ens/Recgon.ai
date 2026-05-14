// Recgon Admin — shared types.
//
// Recgon is the dispatcher (the "admin") sitting above a unified roster of
// human + AI teammates. It reads a unified brain of open work, mints tasks,
// and assigns each to the best-fit teammate.

export type TeammateStatus = 'active' | 'paused' | 'retired';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Day-precision availability. Hour-of-day was removed; daily capacity is
// derived from `Teammate.capacityHours / max(1, days.length)`.
export type WorkingHours = {
  days: Weekday[];
};

export type FitProfile = {
  // Per-task-kind exponential moving average of ratings, in [-1, 1].
  taskKindScores?: Record<string, number>;
  // Per-skill running stats. Populated by the learning loop after each
  // verified+rated task. Used by `match.ts` to weight the skill score by
  // recent quality so a strong teammate keeps getting routed work in their
  // wheelhouse and a struggling teammate is biased toward different work.
  skillStats?: Record<string, SkillStat>;
  lastUpdated?: string;
};

export type SkillStat = {
  tasksDone: number;
  avgRating: number;     // EMA in [-1, 1]
  rolling30dAvg: number; // average of ratings within the last 30 days
  lastRatedAt: string;
};

export type Teammate = {
  id: string;
  teamId: string;
  userId: string | null;
  displayName: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  skills: string[];
  capacityHours: number;
  workingHours: WorkingHours | null;
  fitProfile: FitProfile;
  status: TeammateStatus;
  createdAt: string;
};

// Phase 1 / PROFILE-03: team-level visibility toggle for self-declared profiles.
// `team_visible` — collaborative default; teammates can read each other's profiles.
// `owner_only` — stricter; only owners (and self) can read a teammate's profile.
export type ProfileVisibility = 'team_visible' | 'owner_only';

// Phase 1 / PROFILE-03: teammate-self-declared profile, additive over the
// owner-typed `teammates` row. `profileMerge` (Plan 02) folds these into the
// dispatcher's `Teammate` view; the raw vs canonical split keeps the
// teammate-facing UI honest about what Recgon's normaliser did with their
// input ("PostgreSQL — matched as: backend").
export interface TeammateProfile {
  id: string;
  teamId: string;
  userId: string;
  skillsRaw: string[];
  strengthsRaw: string[];
  interestsRaw: string[];
  skillsCanonical: string[];
  strengthsCanonical: string[];
  interestsCanonical: string[];
  weeklyCapacityHours: number | null;
  createdAt: string;
  updatedAt: string;
  // Phase 2 / Plan 02-03. Both columns are on `teammate_profiles`. They land
  // here so `getProfile` is the single source of truth for the worker's
  // consent + cooldown gates — previously the worker mis-read these fields
  // as undefined off the mapper output, which caused `no_consent` early
  // exit on every scan.
  githubMiningConsentAt: string | null;
  lastScanAt: string | null;
}

// Phase 2 / SKILL-03: GitHub-inferred skill source enum. Matches the SQL
// CHECK constraint on `teammate_inferred_skills.source` in
// supabase/migrations/20260513_inferred_skills.sql.
export type InferredSkillSource =
  | 'linguist'
  | 'extension'
  | 'llm_commit'
  | 'llm_import';

// Phase 2 / SKILL-03: one inferred-skill row, camelCase view of the
// `teammate_inferred_skills` table. Date columns stay as ISO strings on the
// camelCase side (matches profileMerge expectations and avoids `Date`
// serialization across server/client boundaries).
export interface InferredSkill {
  id: string;
  teammateId: string;
  teamId: string;
  canonicalTag: string;
  score: number;
  source: InferredSkillSource;
  lastSeenAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  userReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 2 / SKILL-04: keyed by canonical_tag (lowercase). Consumed by
// `profileMerge` in Plan 02-04 for the 3-source blend.
export type InferredSkillMap = Map<string, InferredSkill>;

// Phase 2 / SKILL-03 worker-side write contract. The worker computes
// `score`, `source`, and `lastSeenAt`; the DB defaults the lifecycle fields.
export interface UpsertInferredSkillInput {
  teammateId: string;
  teamId: string;
  canonicalTag: string;
  score: number;
  source: InferredSkillSource;
  lastSeenAt: string;
}

export type TeammateWithStats = Teammate & {
  stars: number;
  ratingCount: number;
  upCount: number;
  downCount: number;
  inFlightCount: number;
  // Sum of `estimatedHours` for the teammate's currently in-flight tasks
  // (status ∈ {assigned, accepted, in_progress, awaiting_review}). Drives
  // load-headroom in match.ts. Optional: callers without this signal fall
  // back to inFlightCount × rough-avg.
  inFlightHours?: number;
  teamRole: 'owner' | 'member' | 'viewer' | null;
};

export type TaskKind =
  | 'next_step'
  | 'dev_prompt'
  | 'marketing'
  | 'analytics'
  | 'research'
  | 'custom';

export type TaskSource = 'brain' | 'user' | 'teammate' | 'schedule';

export type TaskStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'declined'
  | 'failed'
  | 'cancelled';

export type VerificationStatus =
  | 'none'
  | 'auto_running'
  | 'auto_passed'
  | 'auto_inconclusive'
  | 'proof_requested'
  | 'proof_evaluating'
  | 'passed'
  | 'failed'
  | 'owner_override';

export type RescheduleRequestStatus = 'none' | 'pending' | 'resolved' | 'dismissed';

export type ProofPayload = {
  text?: string;
  links?: string[];
  attachments?: Array<{ name: string; url: string }>;
  // Free-form fields the teammate can attach (commit shas, asset ids, etc.).
  extras?: Record<string, unknown>;
  submittedAt: string;
  submittedBy: string;
};

export type VerificationStage =
  | 'routing'              // picking the evidence source
  | 'fetching'             // pulling evidence from the chosen source
  | 'judging'              // LLM grading the evidence
  | 'rating';              // post-pass quality rating

export type VerificationEvidence = {
  // Set when auto-verify routes through the commit-diff path.
  commitShas?: string[];
  diffSummary?: string;
  // Set when auto-verify routes through the metric-delta path.
  metric?: string;
  baselineValue?: number;
  observedValue?: number;
  delta?: number;
  // Set when auto-verify routes through the marketing_content lookup.
  artifactIds?: string[];
  // The verification verdict text the LLM produced.
  verdict?: string;
  confidence?: number;
  // How many proof iterations it took (0 = auto-verify only).
  iterations?: number;
  // Live progress for the UI while verification is mid-flight.
  // Cleared (or kept as final stage) once the verdict is reached.
  stage?: VerificationStage;
  // The source the router chose, surfaced for the tooltip.
  routedSource?: string;
  // Granular live narration from the source ("Fetching https://example.com",
  // "Reading commit abc123: feat: add login", "Pulling sessions metric from
  // GA4 property 521058612"). Preferred over the stage-default verb.
  stageDetail?: string;
};

export type AgentTask = {
  id: string;
  teamId: string;
  projectId: string | null;
  title: string;
  description: string;
  kind: TaskKind;
  source: TaskSource;
  sourceRef: Record<string, unknown>;
  requiredSkills: string[];
  priority: number; // 0=p0..3=p3
  estimatedHours: number;
  deadline: string | null;
  assignedTo: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  status: TaskStatus;
  jobId: string | null;
  result: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
  proof: ProofPayload | null;
  verificationStatus: VerificationStatus;
  verificationEvidence: VerificationEvidence | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  scheduledDate: string | null;        // YYYY-MM-DD, start day (no time-of-day)
  scheduledUntilDate: string | null;   // YYYY-MM-DD, end day (inclusive); null = single-day
  scheduleNote: string | null;
  rescheduleRequestStatus: RescheduleRequestStatus;
  rescheduleRequestedAt: string | null;
  rescheduleRequestedBy: string | null;
  rescheduleRequestNote: string | null;
  rescheduleRequestedDate: string | null; // YYYY-MM-DD
  // Phase 3 / Plan 03 — JSONB envelope used by the "Why you" UI/email line.
  // Optional + nullable: null on pre-Phase-3 rows + legacy manual
  // reassignments; undefined on test fixtures or stubs that don't supply
  // it. API routes strip this before returning to clients (privacy boundary
  // T-03-03-03) — only the rendered `whyYouSentence` string is exposed.
  assignmentReasoning?: AssignmentReasoning | null;
  // Phase 3 / Plan 06 — explanation for why this task stays unassigned.
  // Set by the dispatcher when no candidate clears the FIT-signal floor, or
  // when qualified candidates have no capacity within the lookahead, or
  // when the grounded Why-you LLM cannot produce a sentence. Cleared on
  // successful assignment. Deferred tasks (scheduled forward) keep this
  // null — the reason lives in schedule_note. Null on pre-Plan-06 rows.
  triageNote?: TriageNote | null;
};

// Phase 3 / Plan 06 — refusal categories for the Pass 3 decision tree.
// Each value maps to a distinct outcome the dispatcher records when it
// CANNOT assign a task. Deferred tasks (scheduledDate moved forward) are
// NOT a triage state — they keep triageNote=null.
export type TriageNote =
  | 'no_clear_fit'              // no candidate above SIGNAL_FLOOR on any FIT signal
  | 'no_grounded_reason'        // qualified but Plan 03-05 Why-you LLM returned null
  | 'no_capacity_in_window'     // qualified candidates booked across full lookahead
  | 'no_capacity_high_priority'; // priority>=3 + qualified-but-booked-NOW (bypasses deferral)

export type TaskRating = {
  taskId: string;
  teammateId: string;
  rating: 1 | -1;
  note?: string;
  ratedBy: string;
  ratedAt: string;
};

export type BrainEntry = {
  // Stable dedup key so re-running the brain never mints duplicates.
  dedupKey: string;
  kind: TaskKind;
  source: TaskSource;
  sourceRef: Record<string, unknown>;
  title: string;
  description: string;
  requiredSkills: string[];
  priority: number;
  estimatedHours: number;
  projectId?: string | null;
  deadline?: string | null;
};

export type BrainSnapshot = {
  computedAt: string;
  totalEntries: number;
  byKind: Record<TaskKind, number>;
  entries: BrainEntry[];
};

export type AssignmentLogEntry = {
  taskId: string;
  taskTitle: string;
  teammateId: string | null;
  teammateName: string | null;
  score: number;
  reason: string;
  ts: string;
};

export type RecgonState = {
  teamId: string;
  brainSnapshot: BrainSnapshot | null;
  lastDispatchAt: string | null;
  assignmentLog: AssignmentLogEntry[];
};

// ── Phase 3 — LLM judgment overlay (Plan 01) ─────────────────────────────────
//
// Pure-function input shape for `runJudgment` in `lib/recgon/judge.ts`.
// The caller (Plan 02 dispatcher integration) is responsible for keeping the
// anon_id → user_id mapping; the judge never sees real names or user IDs.

import type { MatchResult } from './match';
import type { JudgePick } from '../schemas';

export type JudgeCandidateInput = {
  // No real user_id at this layer — judge sees only anon_id 1/2/3.
  score: number;                           // total fit, 0–1
  breakdown: {
    skill_match: number;
    fit_for_task_kind: number;
    calendar_availability: number;
    workload_headroom: number;
  };
  confirmedSkills: string[];               // canonical vocab only
  interests: string[];                     // canonical vocab only
  recentTasks: Array<{
    kind: string;
    skills: string[];
    avgRating?: number;
  }>;
};

export type JudgeTaskInput = {
  taskId: string;
  title: string;                           // safe — Recgon-minted, not user-typed freeform
  kind: string;
  requiredSkills: string[];
  estimatedHours: number;
  candidates: JudgeCandidateInput[];       // length 2 or 3 only
};

// Written to `agent_tasks.assignment_reasoning` JSONB by Plan 03. Plan 01
// defines the shape so the judge module + dispatcher integration agree on it.
//
// Plan 05: both discriminants gain an optional `whyYouSentence?: string | null`
// pre-rendered at assignment time by the dispatcher's grounded LLM call.
// Callers (API/email/UI) read it directly with NO new LLM call. Null means
// the LLM tried but couldn't ground a sentence (or cap was exhausted) —
// Plan 03-06 wires the null trigger to assignment refusal. Undefined means
// the envelope is from a pre-Plan-05 row (legacy back-compat).
export type AssignmentReasoning =
  | {
      kind: 'math_only';
      mathScore: number;
      mathBreakdown: MatchResult['breakdown'];
      whyYouSentence?: string | null;
    }
  | {
      kind: 'llm_tiebreaker';
      mathScore: number;
      mathBreakdown: MatchResult['breakdown'];
      judge: JudgePick;
      whyYouSentence?: string | null;
    };

// Re-export the schema-derived JudgePick/JudgeResult so consumers can import
// everything from one place. Callers that want the Zod schema itself import
// from `lib/schemas`.
export type { JudgePick, JudgeResult } from '../schemas';
