import { z } from 'zod';
import type { ActivitySource } from '../activityLog';

/**
 * Execution context passed to every tool handler. Derived server-side from the
 * authenticated session — never trust the model to supply these fields.
 */
export interface ToolContext {
  userId: string;
  teamId: string;
  source: ActivitySource;
}

/**
 * A tool is the shared handler behind a capability. Both the chat route
 * (Gemini function calling) and the existing REST API routes should dispatch
 * through tools so every invocation is logged and visible on both surfaces.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** Zod schema for the arguments the model (or route) will pass. */
  parameters: z.ZodType<TInput>;
  /** Optional: produces a short human-readable summary for the activity log. */
  summarize?: (input: TInput, output: TOutput) => string;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<TOutput = unknown> {
  ok: boolean;
  output?: TOutput;
  error?: string;
}
