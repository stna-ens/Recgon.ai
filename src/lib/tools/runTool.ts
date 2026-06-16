import { logActivity, updateActivity } from '../activityLog';
import type { ToolContext, ToolDefinition, ToolResult } from './types';
import { getTool } from './registry';

/**
 * Execute a tool by name with shared auth context. Every invocation is logged
 * to the activities table so both GUI and terminal surfaces see what happened.
 *
 * Destructive tools (delete/remove/retire/dispatch) refuse to run unless the
 * caller passes `confirm: true`. Without it, the tool returns `needsConfirm`
 * and a human sentence to confirm — the terminal route asks the user first.
 * The confirmation is resolved (the target name is real) but NOTHING mutates.
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
  const data = parsed.data as TInput;

  // Destructive guard: stop before any side effect unless explicitly confirmed.
  const confirmed = (parsed.data as { confirm?: boolean } | null)?.confirm === true;
  if (tool.destructive && !confirmed) {
    let message: string;
    try {
      message = tool.confirmPrompt
        ? await tool.confirmPrompt(data, ctx)
        : `run ${tool.name}`;
    } catch (err) {
      // Resolution failed (e.g. "no project matching X") — surface that, not a
      // confirm prompt. There's nothing to confirm if the target doesn't exist.
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    return {
      ok: false,
      needsConfirm: true,
      output: { confirm: true, message } as unknown as TOutput,
    };
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
    const output = await tool.handler(data, ctx);
    const summary = tool.summarize?.(data, output);
    if (activityId) {
      await updateActivity(activityId, { status: 'succeeded', resultSummary: summary });
    }
    const display = tool.display?.(data, output) ?? undefined;
    return { ok: true, output, display: display ?? undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (activityId) {
      await updateActivity(activityId, { status: 'failed', error: msg });
    }
    return { ok: false, error: msg };
  }
}
