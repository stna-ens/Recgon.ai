// Representative task-tool coverage: tools wrap the right storage functions,
// resolve entities by name, and emit card displays.

import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockListTasks = vi.fn();
const mockListTeammates = vi.fn();
const mockReassignTask = vi.fn(async (..._a: unknown[]) => undefined);
const mockGetTask = vi.fn();
vi.mock('@/lib/recgon/storage', () => ({
  listTasks: (...a: unknown[]) => mockListTasks(...a),
  listTeammates: (...a: unknown[]) => mockListTeammates(...a),
  reassignTask: (...a: unknown[]) => mockReassignTask(...a),
  getTask: (...a: unknown[]) => mockGetTask(...a),
}));

const mockResolveTask = vi.fn();
const mockResolveTeammate = vi.fn();
vi.mock('@/lib/tools/resolvers', () => ({
  resolveTask: (...a: unknown[]) => mockResolveTask(...a),
  resolveTeammate: (...a: unknown[]) => mockResolveTeammate(...a),
  resolveProject: vi.fn(),
}));

import { taskAssignTool } from '@/lib/tools/tasks/taskAssign';
import { taskListTool } from '@/lib/tools/tasks/taskList';

const ctx = { userId: 'u1', teamId: 't1', source: 'terminal' as const };

beforeEach(() => vi.clearAllMocks());

describe('task_assign', () => {
  it('resolves task + teammate by name and calls reassignTask', async () => {
    mockResolveTask.mockResolvedValue({ id: 'task-1', title: 'Fix login bug' });
    mockResolveTeammate.mockResolvedValue({ id: 'mate-1', displayName: 'Alice' });
    mockGetTask.mockResolvedValue({ id: 'task-1', status: 'assigned' });

    const out = await taskAssignTool.handler({ task: 'login', assignee: 'alice' }, ctx);

    expect(mockResolveTask).toHaveBeenCalledWith('login', 't1');
    expect(mockResolveTeammate).toHaveBeenCalledWith('alice', 't1');
    expect(mockReassignTask).toHaveBeenCalledWith('task-1', 'mate-1', 'u1');
    expect(out).toMatchObject({ title: 'Fix login bug', assignee: 'Alice', status: 'assigned' });
  });
});

describe('task_list', () => {
  it('lists tasks and resolves assignee names', async () => {
    mockListTeammates.mockResolvedValue([{ id: 'mate-1', displayName: 'Alice', userId: 'u1' }]);
    mockListTasks.mockResolvedValue([
      { id: 'task-1', title: 'A', description: 'd', status: 'assigned', priority: 2, estimatedHours: 2, scheduledDate: null, assignedTo: 'mate-1' },
    ]);

    const out = await taskListTool.handler({}, ctx);
    expect(out.count).toBe(1);
    expect(out.tasks[0].assignee).toBe('Alice');

    const display = taskListTool.display!({}, out);
    expect(display?.kind).toBe('tasks');
    expect(display?.items[0].title).toBe('A');
    expect(display?.items[0].badges).toContain('→ Alice');
  });
});
