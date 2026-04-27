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
  lastUpdated?: string;
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

