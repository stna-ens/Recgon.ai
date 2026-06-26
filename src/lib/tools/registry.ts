import { zodToJsonSchema } from 'zod-to-json-schema';
import type { FunctionDeclaration } from '@google/generative-ai';
import type { ToolDefinition } from './types';
import { projectTools } from './projects';
import { analyticsTools } from './analytics';
import { taskTools } from './tasks';
import { issueTools } from './issues';
import { teammateTools } from './teammates';
import { teamTools } from './teams';
import { dispatchTools } from './dispatch';
import { accountTools } from './account';

// All tools, grouped by domain. Sent flat to Gemini (no router) — namespaced
// names (task_*, team_*, teammate_*) group them in the model's attention, and
// terse descriptions keep the declaration payload small.
const ALL_TOOLS: ToolDefinition[] = [
  ...projectTools,
  ...analyticsTools,
  ...taskTools,
  ...issueTools,
  ...teammateTools,
  ...teamTools,
  ...dispatchTools,
  ...accountTools,
];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t] as const));

export function getTool(name: string): ToolDefinition | undefined {
  return byName.get(name);
}

export function listTools(): ToolDefinition[] {
  return ALL_TOOLS;
}

/** True when a tool mutates/destroys state and requires explicit confirmation. */
export function isDestructiveTool(name: string): boolean {
  return Boolean(byName.get(name)?.destructive);
}

/**
 * Produce Gemini-compatible function declarations for every registered tool.
 * Gemini accepts a subset of JSON schema; we convert the Zod schema and strip
 * fields Gemini rejects.
 */
export function geminiFunctionDeclarations(): FunctionDeclaration[] {
  return ALL_TOOLS.map((tool) => {
    const schema = zodToJsonSchema(tool.parameters as never, { target: 'openApi3' }) as Record<string, unknown>;
    return {
      name: tool.name,
      description: tool.description,
      parameters: sanitizeSchema(schema) as FunctionDeclaration['parameters'],
    };
  });
}

/** Recursively strip JSON-schema fields Gemini's schema parser rejects. */
function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === '$schema' || k === 'additionalProperties' || k === 'default') continue;
      out[k] = sanitizeSchema(v);
    }
    return out;
  }
  return schema;
}
