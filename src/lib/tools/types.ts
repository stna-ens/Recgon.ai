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
 * Structured, clickable result rows the terminal renders as cards instead of
 * prose. A tool that lists or fetches entities populates this via `display()`
 * so the UI can show a glass-card row per item (with an [open] deep-link)
 * rather than relying on the model to format a markdown table.
 */
export type ToolDisplayKind =
  | 'tasks'
  | 'projects'
  | 'teammates'
  | 'members'
  | 'invites'
  | 'generic';

export interface ToolDisplayItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Short status/meta chips, e.g. ['pending', 'Jun 18', '2h']. */
  badges?: string[];
  /** App route to open this entity in the GUI (e.g. /projects/<id>). */
  href?: string;
}

export interface ToolDisplay {
  kind: ToolDisplayKind;
  items: ToolDisplayItem[];
  /** Optional one-line caption shown above the cards. */
  caption?: string;
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
  /**
   * Marks a tool that mutates or destroys state irreversibly (delete, remove,
   * retire, run-the-dispatcher). `runTool` refuses to execute these unless the
   * caller passes `confirm: true`, returning `needsConfirm` so the terminal can
   * ask the user first. See `confirmPrompt`.
   */
  destructive?: boolean;
  /**
   * For destructive tools: resolves the target entity (so the confirmation
   * names something real — "delete project \"Recgon\"", not the raw arg) and
   * returns the human sentence to confirm. Thrown errors (e.g. "no project
   * matching X") surface to the model BEFORE any mutation.
   */
  confirmPrompt?: (input: TInput, ctx: ToolContext) => Promise<string>;
  /** Optional: produces a short human-readable summary for the activity log. */
  summarize?: (input: TInput, output: TOutput) => string;
  /** Optional: produces structured card rows for the terminal UI. */
  display?: (input: TInput, output: TOutput) => ToolDisplay | null;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<TOutput = unknown> {
  ok: boolean;
  output?: TOutput;
  error?: string;
  /**
   * Set when a destructive tool was called without `confirm: true`. The handler
   * did NOT run. `output` carries `{ confirm: true, message }` — the message is
   * the sentence the model should ask the user to confirm.
   */
  needsConfirm?: boolean;
  /** Structured rows for the terminal to render as cards. */
  display?: ToolDisplay;
}
