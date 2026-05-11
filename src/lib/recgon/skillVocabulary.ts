// Single source of truth for Recgon canonical skill vocabulary. PROFILE-02. Phase 1 (2026-05-12).
//
// Before this module, the canonical list was inlined inside the
// `TAG_TASK_SKILLS_SYSTEM` prompt in `src/lib/prompts.ts:893-895`. The new
// teammate profile picker (Plan 03) and the existing `skillTagger` must agree
// on exactly one list — otherwise a teammate could pick a tag that the tagger
// would never emit, breaking the Jaccard overlap math in `match.ts`.
//
// This module is pure: no Supabase, no React, no Next types. It is safe to
// import from server, client, and edge contexts.

// Roles — order matches `src/lib/prompts.ts:893` left-to-right.
export const CANONICAL_ROLES = [
  'engineering',
  'frontend',
  'backend',
  'mobile',
  'devops',
  'design',
  'ux_design',
  'marketing',
  'social_media',
  'content_writing',
  'copywriting',
  'seo',
  'ads',
  'growth',
  'analytics',
  'data',
  'sales',
  'customer_support',
  'product',
  'strategy',
  'research',
  'qa',
  'finance',
  'operations',
  'legal',
] as const;

// Modifiers — order matches `src/lib/prompts.ts:895` left-to-right.
export const CANONICAL_MODIFIERS = [
  'ai',
  'ml',
  'video',
  'photo',
  'branding',
  'community',
  'partnerships',
  'fundraising',
  'hiring',
] as const;

// Union of roles + modifiers. Consumers use this as the universal predicate
// against any free-text tag the user types or the LLM emits.
export const CANONICAL_VOCAB = [
  ...CANONICAL_ROLES,
  ...CANONICAL_MODIFIERS,
] as const;

export type CanonicalTag = typeof CANONICAL_VOCAB[number];

export const CANONICAL_SET: Set<string> = new Set<string>(CANONICAL_VOCAB);

export function isCanonical(tag: string): tag is CanonicalTag {
  return CANONICAL_SET.has(tag);
}
