// Destructive-confirmation guard — the safety crux of the terminal control
// surface. A destructive tool must NOT run without confirm:true; it returns
// needsConfirm with a resolved target sentence instead. With confirm:true it
// mutates. confirmPrompt errors (target not found) surface BEFORE any mutation.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { z } from 'zod';

const mockLogActivity = vi.fn(async (..._a: unknown[]) => 'activity-1');
const mockUpdateActivity = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('@/lib/activityLog', () => ({
  logActivity: (...a: unknown[]) => mockLogActivity(...a),
  updateActivity: (...a: unknown[]) => mockUpdateActivity(...a),
}));

const mockGetTool = vi.fn();
vi.mock('@/lib/tools/registry', () => ({
  getTool: (name: string) => mockGetTool(name),
}));

import { runTool } from '@/lib/tools/runTool';
import type { ToolDefinition } from '@/lib/tools/types';

const ctx = { userId: 'u1', teamId: 't1', source: 'terminal' as const };

const handlerSpy = vi.fn(async () => ({ deleted: true }));
const confirmPromptSpy = vi.fn(async () => 'permanently delete project "Recgon"');

function destructiveTool(): ToolDefinition {
  return {
    name: 'project_delete',
    description: 'delete a project',
    destructive: true,
    parameters: z.object({ project: z.string(), confirm: z.boolean().optional() }),
    confirmPrompt: confirmPromptSpy,
    handler: handlerSpy,
  } as unknown as ToolDefinition;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTool.mockReturnValue(destructiveTool());
});

describe('runTool destructive confirmation guard', () => {
  it('returns needsConfirm and does NOT run the handler when confirm is absent', async () => {
    const res = await runTool('project_delete', { project: 'Recgon' }, ctx);
    expect(res.needsConfirm).toBe(true);
    expect(res.ok).toBe(false);
    expect((res.output as { message?: string }).message).toContain('Recgon');
    expect(handlerSpy).not.toHaveBeenCalled();
    // No activity is logged for an un-confirmed (no-op) destructive call.
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('runs the handler when confirm:true is passed', async () => {
    const res = await runTool('project_delete', { project: 'Recgon', confirm: true }, ctx);
    expect(res.ok).toBe(true);
    expect(handlerSpy).toHaveBeenCalledOnce();
    expect(mockLogActivity).toHaveBeenCalledOnce();
  });

  it('surfaces a confirmPrompt resolution error and never mutates', async () => {
    confirmPromptSpy.mockRejectedValueOnce(new Error('No project matching "Nope"'));
    const res = await runTool('project_delete', { project: 'Nope' }, ctx);
    expect(res.ok).toBe(false);
    expect(res.needsConfirm).toBeUndefined();
    expect(res.error).toContain('No project matching');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('non-destructive tools run immediately (no confirm required)', async () => {
    const plainHandler = vi.fn(async () => ({ ok: 1 }));
    mockGetTool.mockReturnValue({
      name: 'task_list',
      description: 'list',
      parameters: z.object({}),
      handler: plainHandler,
    } as unknown as ToolDefinition);
    const res = await runTool('task_list', {}, ctx);
    expect(res.ok).toBe(true);
    expect(plainHandler).toHaveBeenCalledOnce();
  });
});
