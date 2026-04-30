// Recgon Admin — shared types.
//
// Recgon is the dispatcher (the "admin") sitting above a unified roster of
// human + AI teammates. It reads a unified brain of open work, mints tasks,
// and assigns each to the best-fit teammate.

export type TeammateKind = 'human' | 'ai';
export type TeammateStatus = 'active' | 'paused' | 'retired';

export type WorkingHours = {
  tz: string; // IANA, e.g. 'Europe/Istanbul'
  // Per-weekday window as [startHour, endHour] in 24h. Missing = day off.
  mon?: [number, number];
  tue?: [number, number];
  wed?: [number, number];
  thu?: [number, number];
  fri?: [number, number];
  sat?: [number, number];
  sun?: [number, number];
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
  kind: TeammateKind;
  userId: string | null;
  displayName: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  skills: string[];
  systemPrompt?: string | null;
  modelPref?: 'gemini' | 'claude' | null;
  capacityHours: number;
  workingHours: WorkingHours | null;
  fitProfile: FitProfile;
  status: TeammateStatus;
  createdAt: string;
};

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
};

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
  rosterProposal: RosterProposal | null;
};

export type RosterProposal = {
  proposedAt: string;
  reasoning: string;
  teammates: Array<{
    displayName: string;
    title: string;
    skills: string[];
    systemPrompt: string;
    capacityHours: number;
    rationale: string;
  }>;
};

