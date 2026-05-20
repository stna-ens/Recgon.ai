// Phase 4 / Plan 02 — assignment-email description picks personalized when
// bound to the assignee; falls back to the original otherwise.
//
// Scenarios:
//   1. notifyTeammateAssigned called with personalizedDescription populated +
//      personalizedDescriptionForUserId === teammate.userId → email HTML body
//      contains the personalized text (truncated to 280 chars).
//   2. personalizedDescription = null → email body contains the ORIGINAL.
//   3. personalizedDescription = '' (empty string) → email body contains the
//      ORIGINAL (empty falls back).
//   4. personalizedDescriptionForUserId !== teammate.userId → email body
//      contains the ORIGINAL (safety net: column has stale data for a
//      different user; FRAME-04 / T-04-02-02 mitigation).
//   5. The description is escaped via escapeHtml — `<script>` becomes
//      `&lt;script&gt;` (T-04-02-03 mitigation).
//   6. The Plan 3-03 whyYouHtml block still renders when reasoning is passed
//      (no regression).

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AgentTask, Teammate, AssignmentReasoning } from '@/lib/recgon/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Forwarding-reference pattern: the Resend mock's constructor returns an
// instance that calls back into `mockSend` at call time, so a per-test
// `mockSend.mockResolvedValue(...)` resets cleanly without losing the
// constructor wiring (vi.resetAllMocks would otherwise wipe an inline
// `.mockImplementation` on the Resend constructor itself).
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockSend(...args) };
  },
}));

// Supabase look-up of teammate.email — return a stable test address.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { email: 'assignee@example.com' },
          }),
        }),
      }),
    }),
  },
}));

// renderWhyYou is called only when reasoning is present. Mock the renderer.
const mockRenderWhyYou = vi.fn(async () => ({ sentence: 'mocked why-you sentence' }));
vi.mock('@/lib/recgon/whyYou', () => ({
  renderWhyYou: () => mockRenderWhyYou(),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const ORIGINAL_DESCRIPTION = 'Add JWT refresh-token rotation to the auth route.';
const PERSONALIZED_DESCRIPTION =
  'Hey, the auth route is squarely in your TypeScript wheelhouse — start with the rotation handler.';

const ASSIGNEE_USER_ID = 'user-assignee';

function buildTeammate(overrides: Partial<Teammate> = {}): Teammate {
  return {
    id: 'tm-assignee',
    teamId: 'team-1',
    userId: ASSIGNEE_USER_ID,
    displayName: 'Alex',
    avatarColor: null,
    avatarUrl: null,
    title: null,
    skills: [],
    capacityHours: 10,
    workingHours: null,
    fitProfile: {},
    status: 'active',
    createdAt: '2026-05-20T00:00:00Z',
  } as unknown as Teammate;
}

function buildTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    teamId: 'team-1',
    projectId: null,
    title: 'Rotate refresh tokens',
    description: ORIGINAL_DESCRIPTION,
    kind: 'dev_prompt',
    source: 'agent',
    sourceRef: {},
    requiredSkills: [],
    priority: 1,
    estimatedHours: 4,
    deadline: null,
    assignedTo: 'tm-assignee',
    assignedBy: null,
    assignedAt: '2026-05-20T00:00:00Z',
    status: 'assigned',
    jobId: null,
    result: null,
    createdBy: null,
    createdAt: '2026-05-20T00:00:00Z',
    completedAt: null,
    proof: null,
    verificationStatus: 'none',
    verificationEvidence: null,
    verifiedAt: null,
    verifiedBy: null,
    scheduledDate: null,
    scheduledUntilDate: null,
    scheduleNote: null,
    rescheduleRequestStatus: 'none',
    rescheduleRequestedAt: null,
    rescheduleRequestedBy: null,
    rescheduleRequestNote: null,
    rescheduleRequestedDate: null,
    assignmentReasoning: null,
    triageNote: null,
    overdueTier: 0,
    lastOverdueActionAt: null,
    personalizedDescription: PERSONALIZED_DESCRIPTION,
    personalizedDescriptionForUserId: ASSIGNEE_USER_ID,
    ...overrides,
  } as AgentTask;
}

async function callNotify(args: {
  taskOverrides?: Partial<AgentTask>;
  teammateOverrides?: Partial<Teammate>;
  reasoning?: AssignmentReasoning | null;
}) {
  const { notifyTeammateAssigned } = await import('@/lib/notifications');
  await notifyTeammateAssigned({
    teammate: buildTeammate(args.teammateOverrides),
    task: buildTask(args.taskOverrides),
    teamName: 'Recgon Test Team',
    reasoning: args.reasoning ?? null,
  });
  expect(mockSend).toHaveBeenCalledOnce();
  const callArg = mockSend.mock.calls[0][0] as { html: string };
  return callArg.html;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Plug RESEND_API_KEY so the early-return guard doesn't no-op the test.
  process.env.RESEND_API_KEY = 'test-resend-key';
  mockSend.mockResolvedValue({ error: null });
  mockRenderWhyYou.mockResolvedValue({ sentence: 'mocked why-you sentence' });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('notifyTeammateAssigned — personalized description handling', () => {
  it('1. personalized populated + bound to assignee → email body contains personalized text (not original)', async () => {
    const html = await callNotify({});
    expect(html).toContain('Hey, the auth route is squarely in your TypeScript wheelhouse');
    // The original must NOT appear (its prefix would also be unique).
    expect(html).not.toContain('Add JWT refresh-token rotation to the auth route.');
  });

  it('2. personalizedDescription = null → email body contains the ORIGINAL', async () => {
    const html = await callNotify({
      taskOverrides: {
        personalizedDescription: null,
        personalizedDescriptionForUserId: null,
      },
    });
    expect(html).toContain('Add JWT refresh-token rotation to the auth route.');
    expect(html).not.toContain('Hey, the auth route is squarely in your TypeScript wheelhouse');
  });

  it('3. personalizedDescription = "" (empty) → email body contains the ORIGINAL', async () => {
    const html = await callNotify({
      taskOverrides: {
        personalizedDescription: '',
        personalizedDescriptionForUserId: ASSIGNEE_USER_ID,
      },
    });
    expect(html).toContain('Add JWT refresh-token rotation to the auth route.');
  });

  it('4. personalizedDescriptionForUserId !== teammate.userId → email body contains ORIGINAL (race shield)', async () => {
    const html = await callNotify({
      taskOverrides: {
        personalizedDescription: PERSONALIZED_DESCRIPTION,
        personalizedDescriptionForUserId: 'user-previous-assignee',
      },
    });
    expect(html).toContain('Add JWT refresh-token rotation to the auth route.');
    expect(html).not.toContain('Hey, the auth route is squarely in your TypeScript wheelhouse');
  });

  it('5. description is escaped via escapeHtml — <script> becomes &lt;script&gt;', async () => {
    const html = await callNotify({
      taskOverrides: {
        personalizedDescription: 'Hey <script>alert(1)</script> nice work',
        personalizedDescriptionForUserId: ASSIGNEE_USER_ID,
      },
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
    // The raw tag must NEVER appear in the rendered body.
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('</script>');
  });

  it('6. whyYouHtml block from Plan 3-03 still renders alongside personalized description (no regression)', async () => {
    const reasoning: AssignmentReasoning = {
      kind: 'llm_tiebreaker',
      mathScore: 0.78,
      mathBreakdown: {
        skillOverlap: 0.8,
        fitForKind: 0.7,
        availabilityNow: 0.6,
        loadHeadroom: 0.5,
        interestNudge: 0,
      },
      judge: {
        task_id: 'task-1',
        chosen_candidate_id: 1,
        reason_code: 'skill_depth',
        reason_sentence: 'you have the deepest typescript history of the candidates.',
        confidence: 'high',
      },
    } as unknown as AssignmentReasoning;
    const html = await callNotify({ reasoning });
    // Personalized line still present...
    expect(html).toContain('Hey, the auth route is squarely in your TypeScript wheelhouse');
    // ...AND the why-you block is rendered (from the mocked sentence).
    expect(html).toContain('Why you:');
    expect(html).toContain('mocked why-you sentence');
  });
});
