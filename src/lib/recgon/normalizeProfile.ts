// Phase 1 / PROFILE-03 / Plan 01-03.
//
// One LLM call per profile save: maps the teammate's typed free-text entries
// (skills / strengths / interests) to canonical tags drawn from
// `skillVocabulary.ts`. The LLM output is filtered through `CANONICAL_SET`
// defense-in-depth before being returned — even a jailbroken model that emits
// `'admin'` has its hallucinated tags dropped silently (Pitfall 1).
//
// LLM-failure-safe (Pitfall 7): when `chatViaChain` throws, the LLM returns
// malformed JSON, or the schema parse rejects the response, we return
// passthrough entries `{ raw, canonical: [] }` with `degraded: true`. The
// caller (route handler) then persists the user's raw text with empty
// canonical arrays + `normalization_pending = true`. The user's typed text
// is sacred — it is never lost.
//
// Function-timeout safety (Pitfall 8): `chatViaChain` is invoked with
// `timeoutMs: 8000` so the post-LLM Supabase write still has ~2s of headroom
// inside Vercel's default 10s function budget.

import { logger } from '../logger';
import { chatViaChain, PROVIDER_CHAIN } from '../llm/providers';
import { SKILL_NORMALIZE_SYSTEM, skillNormalizeUserPrompt } from '../prompts';
import { SkillNormalizationResultSchema, parseAIResponse } from '../schemas';
import { CANONICAL_SET } from './skillVocabulary';

export type NormalizedEntry = {
  raw: string;
  canonical: string[];
};

export type NormalizeProfileResult = {
  skills: NormalizedEntry[];
  strengths: NormalizedEntry[];
  interests: NormalizedEntry[];
  degraded: boolean;
};

export type NormalizeProfileInput = {
  skillsRaw: string[];
  strengthsRaw: string[];
  interestsRaw: string[];
};

function passthrough(raws: string[]): NormalizedEntry[] {
  return raws.map((raw) => ({ raw, canonical: [] }));
}

function filterCanonical(
  inputRaw: string[],
  llmEntries: Array<{ raw: string; canonical: string[] }>,
): { entries: NormalizedEntry[]; dropped: string[] } {
  // Align LLM output to the input order — the LLM is instructed to preserve
  // order but we don't trust it. Fall back to passthrough for any input the
  // LLM didn't return.
  const byRaw = new Map<string, string[]>();
  for (const entry of llmEntries) {
    if (!byRaw.has(entry.raw)) byRaw.set(entry.raw, entry.canonical);
  }
  const dropped: string[] = [];
  const entries = inputRaw.map((raw) => {
    const canon = byRaw.get(raw) ?? [];
    const kept: string[] = [];
    for (const tag of canon) {
      const lowered = tag.toLowerCase();
      if (CANONICAL_SET.has(lowered)) {
        kept.push(lowered);
      } else {
        dropped.push(tag);
      }
    }
    // Cap at 3 — the prompt asks for 0–3, the schema allows up to 6 to give
    // the LLM headroom, and the post-hoc filter clamps the final stored value.
    return { raw, canonical: Array.from(new Set(kept)).slice(0, 3) };
  });
  return { entries, dropped };
}

export async function normalizeProfileTerms(
  input: NormalizeProfileInput,
): Promise<NormalizeProfileResult> {
  const totalRaw =
    input.skillsRaw.length + input.strengthsRaw.length + input.interestsRaw.length;
  if (totalRaw === 0) {
    return {
      skills: [],
      strengths: [],
      interests: [],
      degraded: false,
    };
  }

  try {
    const raw = await chatViaChain(
      PROVIDER_CHAIN,
      SKILL_NORMALIZE_SYSTEM,
      skillNormalizeUserPrompt(input),
      {
        temperature: 0,
        taskKind: 'recgon_skill_normalize',
        promptVersion: 'v1',
        timeoutMs: 8000,
      },
    );
    const parsed = parseAIResponse(raw, SkillNormalizationResultSchema);

    const skills = filterCanonical(input.skillsRaw, parsed.skills);
    const strengths = filterCanonical(input.strengthsRaw, parsed.strengths);
    const interests = filterCanonical(input.interestsRaw, parsed.interests);
    const dropped = [...skills.dropped, ...strengths.dropped, ...interests.dropped];
    if (dropped.length > 0) {
      logger.warn('normalizeProfileTerms dropped non-canonical tags', {
        count: dropped.length,
        sample: dropped.slice(0, 5),
      });
    }
    return {
      skills: skills.entries,
      strengths: strengths.entries,
      interests: interests.entries,
      degraded: false,
    };
  } catch (error) {
    logger.error('normalizeProfileTerms degraded', { error });
    return {
      skills: passthrough(input.skillsRaw),
      strengths: passthrough(input.strengthsRaw),
      interests: passthrough(input.interestsRaw),
      degraded: true,
    };
  }
}
