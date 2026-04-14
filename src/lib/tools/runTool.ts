import { logActivity, updateActivity } from '../activityLog';
import type { ToolContext, ToolDefinition, ToolResult } from './types';
import { getTool } from './registry';

/**
 * Execute a tool by name with shared auth context. Every invocation is logged
 * to the activities table so both GUI and terminal surfaces see what happened.
 */
export async function runTool<TInput = unknown, TOutput = unknown>(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult<TOutput>> {
  const tool = getTool(name) as ToolDefinition<TInput, TOutput> | undefined;
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  const parsed = tool.parameters.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: `Invalid arguments: ${parsed.error.message}` };
  }

  const projectId = (parsed.data as { projectId?: string } | null)?.projectId;
  const activityId = await logActivity({
    teamId: ctx.teamId,
    userId: ctx.userId,
    projectId,
    source: ctx.source,
    toolName: tool.name,
    args: (parsed.data ?? {}) as Record<string, unknown>,
    status: 'started',
  });

  try {
    const output = await tool.handler(parsed.data as TInput, ctx);
    const summary = tool.summarize?.(parsed.data as TInput, output);
    if (activityId) {
      await updateActivity(activityId, { status: 'succeeded', resultSummary: summary });
    }
    return { ok: true, output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (activityId) {
      await updateActivity(activityId, { status: 'failed', error: msg });
    }
    return { ok: false, error: msg };
  }
}
