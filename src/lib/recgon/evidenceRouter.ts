// LLM-driven evidence router. Replaces the old hardcoded `task.kind`
// switch in verify.ts. Reads the task + (optional) proof, considers what
// sources are viable, and picks one.
//
// The router runs *before* the verifier. The verifier then fetches from
// the chosen source and grades the evidence. So Recgon's flow per task is:
//
//   1. listViableSources(task)            → which sources even apply?
//   2. routeEvidence(task, viable)        → LLM picks ONE
//   3. SOURCES[chosen].fetch(task, opts)  → pull evidence text
//   4. judge with verification LLM        → pass / fail / inconclusive
//
// Falls back gracefully: if the LLM picks an invalid source, we coerce to
// the highest-confidence viable source. If routing itself fails, we pick
// the first viable source by priority order.

import { logger } from '../logger';
import { chatViaProviders } from '../llm/providers';
import { EvidenceRouteSchema, parseAIResponse } from '../schemas';
import { ROUTE_EVIDENCE_SYSTEM, routeEvidenceUserPrompt } from '../prompts';
import {
  SOURCES,
  describeSources,
  extractUrls,
  listViableSources,
  type EvidenceSourceName,
} from './evidenceSources';
import type { AgentTask } from './types';

// Priority for fallback (real signal beats writeup beats nothing).
const PRIORITY: EvidenceSourceName[] = [
  'github_commits',
  'ga4_metric',
  'instagram_graph',
  'marketing_artifacts',
  'web_fetch',
  'proof_writeup',
  'none',
];

function pickFallback(viable: EvidenceSourceName[]): { source: EvidenceSourceName; url?: string } {
  for (const name of PRIORITY) {
    if (viable.includes(name)) return { source: name };
  }
  return { source: 'none' };
}

function summarizeProof(task: AgentTask): string {
  const proof = task.proof;
  if (!proof) return '';
  const parts: string[] = [];
  if (proof.text) parts.push(`Text: ${proof.text.slice(0, 600)}`);
  if (proof.links?.length) parts.push(`Links: ${proof.links.join(', ')}`);
  if (proof.attachments?.length) {
    parts.push(`Attachments: ${proof.attachments.map((a) => a.name).join(', ')}`);
  }
  return parts.join('\n');
}

export type RouteDecision = {
  source: EvidenceSourceName;
  url?: string;
  reasoning: string;
};

export async function routeEvidence(task: AgentTask): Promise<RouteDecision> {
  const viable = await listViableSources(task);

  // Fast paths: zero or one viable source — skip the LLM call.
  if (viable.length === 0) {
    return { source: 'none', reasoning: 'No evidence source is viable for this task.' };
  }
  if (viable.length === 1) {
    return {
      source: viable[0],
      reasoning: `Only viable source: ${viable[0]}.`,
      url: viable[0] === 'web_fetch' ? extractUrls(task.proof?.text ?? task.description)[0] : undefined,
    };
  }

  try {
    const raw = await chatViaProviders(
      ROUTE_EVIDENCE_SYSTEM,
      routeEvidenceUserPrompt({
        taskTitle: task.title,
        taskDescription: task.description,
        taskKind: task.kind,
        proofSummary: summarizeProof(task),
        availableSources: describeSources(viable),
      }),
      { temperature: 0.1, maxTokens: 512, taskKind: 'evidence_routing' as never },
    );
    const parsed = parseAIResponse(raw, EvidenceRouteSchema);

    // Coerce: if the LLM picked something not viable, fall back.
    if (parsed.source !== 'none' && !viable.includes(parsed.source)) {
      logger.warn('router: LLM picked non-viable source, falling back', {
        taskId: task.id,
        picked: parsed.source,
        viable,
      });
      const fb = pickFallback(viable);
      return { ...fb, reasoning: `(coerced) ${parsed.reasoning}` };
    }

    // For web_fetch with no URL, try to extract one from the task.
    let url = parsed.url;
    if (parsed.source === 'web_fetch' && !url) {
      url = extractUrls(task.proof?.text ?? task.description)[0]
        ?? task.proof?.links?.[0];
    }

    return { source: parsed.source, url, reasoning: parsed.reasoning };
  } catch (err) {
    logger.warn('router: LLM routing failed, falling back to priority order', {
      taskId: task.id,
      err: err instanceof Error ? err.message : String(err),
    });
    const fb = pickFallback(viable);
    return { ...fb, reasoning: 'Router failed; selected by priority order.' };
  }
}

// Re-export so verify.ts can call sources directly.
export { SOURCES };
