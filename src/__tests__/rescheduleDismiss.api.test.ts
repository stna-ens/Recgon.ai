// Mission Control — PATCH /api/teams/[id]/tasks/[taskId]/reschedule-request
// (owner denies a pending reschedule request).
//
// Locks down: owner-only (403 for members), pending-only (409 otherwise),
// status set to 'dismissed', and the audit event carries who/what.

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockVerifyTeamAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
}));

const mockGetTask = vi.fn();
const mockSetStatus = vi.fn();
const mockLogEvent = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  getTeammate: vi.fn(),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  requestTaskReschedule: vi.fn(),
  setTaskRescheduleRequestStatus: (...args: unknown[]) => mockSetStatus(...args),
}));

const teamId = 'team-1';
const taskId = 'task-1';

function pendingTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    teamId,
    assignedTo: 'tm-1',
    status: 'assigned',
    rescheduleRequestStatus: 'pending',
    rescheduleRequestedDate: '2026-06-20',
    rescheduleRequestNote: 'need more time',
    ...overrides,
  };
}

async function callPATCH(body: unknown = { action: 'dismiss' }) {
  const { PATCH } = await import('@/app/api/teams/[id]/tasks/[taskId]/reschedule-request/route');
  const params = Promise.resolve({ id: teamId, taskId });
  return PATCH(
    new Request(`http://localhost/api/teams/${teamId}/tasks/${taskId}/reschedule-request`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }) as never,
    { params },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-owner' } });
});

describe('PATCH /reschedule-request (deny)', () => {
  it('member is rejected with 403', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    const res = await callPATCH();
    expect(res.status).toBe(403);
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('409 when there is no pending request', async () => {
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockGetTask.mockResolvedValue(pendingTask({ rescheduleRequestStatus: 'none' }));
    const res = await callPATCH();
    expect(res.status).toBe(409);
  });

  it('400 on unsupported action', async () => {
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockGetTask.mockResolvedValue(pendingTask());
    const res = await callPATCH({ action: 'approve' });
    expect(res.status).toBe(400);
  });

  it('owner dismiss → status dismissed + audit event with requester context', async () => {
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockGetTask.mockResolvedValue(pendingTask());
    const res = await callPATCH();
    expect(res.status).toBe(200);
    expect(mockSetStatus).toHaveBeenCalledWith(taskId, 'dismissed');
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reschedule_dismissed',
        taskId,
        payload: expect.objectContaining({
          by: 'user-owner',
          requestedDate: '2026-06-20',
        }),
      }),
    );
  });
});
