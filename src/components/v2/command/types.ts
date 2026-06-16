// Client-side mirrors of the /api/teams/[id]/command payload. The server
// sanitizes tasks through sanitizeTaskForClient (CR-01), so these types
// deliberately have NO assignmentReasoning / personalizedDescription.

export interface CommandTask {
  id: string;
  teamId: string;
  projectId: string | null;
  title: string;
  description: string;
  kind: string;
  source: string;
  priority: number;
  estimatedHours: number;
  deadline: string | null;
  assignedTo: string | null;
  assignedAt: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  scheduledDate: string | null;
  scheduledUntilDate: string | null;
  scheduleNote: string | null;
  rescheduleRequestStatus: string;
  rescheduleRequestedAt: string | null;
  rescheduleRequestedBy: string | null;
  rescheduleRequestNote: string | null;
  rescheduleRequestedDate: string | null;
  overdueTier: number;
  triageNote: string | null;
  verificationStatus: string | null;
}

export interface CommandTeammate {
  id: string;
  userId: string | null;
  displayName: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  // Dispatch Floor signals (additive; older payloads omit them).
  // Load is computed server-side from real hours — see the command route.
  capacityHours?: number;
  inFlightHours?: number;
  loadPct?: number;
  isIdle?: boolean;
  skills?: string[];
  stars?: number;
}

export interface CommandProject {
  id: string;
  name: string;
}

export interface CommandDecisions {
  rescheduleRequests: CommandTask[];
  overdue: CommandTask[];
  triaged: CommandTask[];
  awaitingReview: CommandTask[];
}

export interface CommandResponse {
  role: 'owner' | 'member' | 'viewer';
  decisions: CommandDecisions | null;
  tasks: CommandTask[];
  teammates: CommandTeammate[];
  projects: CommandProject[];
}
