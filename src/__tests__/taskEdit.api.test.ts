// Phase C — PATCH /api/teams/[id]/tasks/[taskId] { action: 'edit' }.
//
// Locks down the permission matrix (owner always; creator only on
// user-minted tasks; everyone else 403), field validation, the
// description→reframe re-enqueue, the audit event, and CR-01 on the
// response.

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const mockVerifyTeamAccess = vi.fn();
const mockVerifyTeamWriteAccess = vi.fn();
vi.mock('@/lib/teamStorage', () => ({
  verifyTeamAccess: (...args: unknown[]) => mockVerifyTeamAccess(...args),
  verifyTeamWriteAccess: (...args: unknown[]) => mockVerifyTeamWriteAccess(...args),
}));

const mockGetTask = vi.fn();
const mockUpdateDetails = vi.fn();
const mockLogEvent = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  getTask: (...args: unknown[]) => mockGetTask(...args),
  deleteTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskDetails: (...args: unknown[]) => mockUpdateDetails(...args),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}));

const mockEnqueueReframe = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/recgon/reframeEnqueue', () => ({
  enqueueReframeJob: (...args: unknown[]) => mockEnqueueReframe(...args),
}));

const teamId = 'team-1';
const taskId = 'task-1';

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    teamId,
    title: 'Old title',
    description: 'Old description',
    source: 'brain',
    status: 'assigned',
    assignedTo: 'tm-1',
    createdBy: 'user-creator',
    priority: 2,
    deadline: null,
    assignmentReasoning: { kind: 'math_only', whyYouSentence: 'SECRET-ENVELOPE' },
    personalizedDescription: 'SECRET-PERSONALIZED',
    personalizedDescriptionForUserId: 'user-x',
    ...overrides,
  };
}

async function callPATCH(body: unknown) {
  const { PATCH } = await import('@/app/api/teams/[id]/tasks/[taskId]/route');
  const params = Promise.resolve({ id: teamId, taskId });
  return PATCH(
    new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }) as never,
    { params },
  ) as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  mockVerifyTeamWriteAccess.mockResolvedValue(true);
});

describe('PATCH edit — permissions', () => {
  it('member who is not creator → 403', async () => {
    mockVerifyTeamAccess.mockResolvedValue('member');
    mockGetTask.mockResolvedValue(makeTask());
    const res = await callPATCH({ action: 'edit', title: 'New' });
    expect(res.status).toBe(403);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('creator of a brain-minted task → 403 (owner only)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-creator' } });
    mockVerifyTeamAccess.mockResolvedValue('member');
    mockGetTask.mockResolvedValue(makeTask({ source: 'brain' }));
    const res = await callPATCH({ action: 'edit', title: 'New' });
    expect(res.status).toBe(403);
  });

  it('creator of a user-minted task → allowed', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-creator' } });
    mockVerifyTeamAccess.mockResolvedValue('member');
    mockGetTask.mockResolvedValue(makeTask({ source: 'user' }));
    const res = await callPATCH({ action: 'edit', title: 'New title' });
    expect(res.status).toBe(200);
    expect(mockUpdateDetails).toHaveBeenCalledWith(taskId, { title: 'New title' });
  });

  it('owner can edit brain-minted tasks', async () => {
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockGetTask.mockResolvedValue(makeTask());
    const res = await callPATCH({ action: 'edit', priority: 3 });
    expect(res.status).toBe(200);
    expect(mockUpdateDetails).toHaveBeenCalledWith(taskId, { priority: 3 });
  });
});

describe('PATCH edit — validation + side effects', () => {
  beforeEach(() => {
    mockVerifyTeamAccess.mockResolvedValue('owner');
    mockGetTask.mockResolvedValue(makeTask());
  });

  it('rejects empty titles and out-of-range priority', async () => {
    expect((await callPATCH({ action: 'edit', title: '   ' })).status).toBe(400);
    expect((await callPATCH({ action: 'edit', priority: 9 })).status).toBe(400);
    expect((await callPATCH({ action: 'edit' })).status).toBe(400);
  });

  it('description edit re-enqueues the reframe for the assignee', async () => {
    const res = await callPATCH({ action: 'edit', description: 'New description' });
    expect(res.status).toBe(200);
    expect(mockEnqueueReframe).toHaveBeenCalledWith(taskId, 'tm-1', teamId);
  });

  it('title-only edit does NOT re-enqueue a reframe', async () => {
    await callPATCH({ action: 'edit', title: 'New title' });
    expect(mockEnqueueReframe).not.toHaveBeenCalled();
  });

  it('deadline YYYY-MM-DD is anchored to end-of-day; null clears', async () => {
    await callPATCH({ action: 'edit', deadline: '2026-07-01' });
    expect(mockUpdateDetails).toHaveBeenCalledWith(taskId, { deadline: '2026-07-01T23:59:59Z' });
    await callPATCH({ action: 'edit', deadline: null });
    expect(mockUpdateDetails).toHaveBeenCalledWith(taskId, { deadline: null });
  });

  it('writes the edited audit event and sanitizes the response (CR-01)', async () => {
    const res = await callPATCH({ action: 'edit', title: 'New title' });
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'edited',
        payload: expect.objectContaining({ by: 'user-1', fields: ['title'] }),
      }),
    );
    const blob = JSON.stringify(await res.json());
    expect(blob).not.toContain('SECRET-ENVELOPE');
    expect(blob).not.toContain('SECRET-PERSONALIZED');
    expect(blob).not.toContain('assignmentReasoning');
  });

  it('terminal tasks cannot be edited', async () => {
    mockGetTask.mockResolvedValue(makeTask({ status: 'completed' }));
    expect((await callPATCH({ action: 'edit', title: 'x' })).status).toBe(400);
  });
});
