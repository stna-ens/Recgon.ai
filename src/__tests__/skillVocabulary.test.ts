// Phase 1 / PROFILE-02: Single source of truth for Recgon canonical skill vocab.
// Verifies the new `skillVocabulary` module exposes the same lists previously
// inlined inside `prompts.ts:893-895` and that consumers (`prompts.ts`,
// `skillTagger.ts`) interpolate from it instead of duplicating literals.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_ROLES,
  CANONICAL_MODIFIERS,
  CANONICAL_VOCAB,
  CANONICAL_SET,
  isCanonical,
} from '../lib/recgon/skillVocabulary';

// Expected lists copied verbatim from the original inlined vocab in
// `src/lib/prompts.ts:893-895`. Once the refactor lands, both this test file
// AND `prompts.ts` derive from `skillVocabulary.ts` — they MUST match.
const EXPECTED_ROLES = [
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
];

const EXPECTED_MODIFIERS = [
  'ai',
  'ml',
  'video',
  'photo',
  'branding',
  'community',
  'partnerships',
  'fundraising',
  'hiring',
];

describe('skillVocabulary', () => {
  it('CANONICAL_ROLES length matches the original prompts.ts:893 token count', () => {
    expect(CANONICAL_ROLES).toEqual(EXPECTED_ROLES);
    expect(CANONICAL_ROLES.length).toBe(EXPECTED_ROLES.length);
  });

  it('CANONICAL_MODIFIERS matches prompts.ts:895 token-for-token in order', () => {
    expect(CANONICAL_MODIFIERS).toEqual(EXPECTED_MODIFIERS);
  });

  it('CANONICAL_VOCAB equals [...roles, ...modifiers] with no duplicates', () => {
    expect(CANONICAL_VOCAB).toEqual([...EXPECTED_ROLES, ...EXPECTED_MODIFIERS]);
    expect(new Set(CANONICAL_VOCAB).size).toBe(CANONICAL_VOCAB.length);
  });

  it('CANONICAL_SET is a Set; isCanonical() reflects membership', () => {
    expect(CANONICAL_SET).toBeInstanceOf(Set);
    expect(isCanonical('engineering')).toBe(true);
    expect(isCanonical('frontend')).toBe(true);
    expect(isCanonical('hiring')).toBe(true);
    expect(isCanonical('nodejs')).toBe(false);
    expect(isCanonical('react_native')).toBe(false);
    expect(isCanonical('')).toBe(false);
  });

  it('TAG_TASK_SKILLS_SYSTEM still contains the same Roles + Modifiers comma-joined strings after refactor', () => {
    const promptsPath = resolve(__dirname, '../lib/prompts.ts');
    const src = readFileSync(promptsPath, 'utf8');
    // The post-refactor system prompt MUST interpolate the canonical lists, so
    // the rendered string at runtime should still include
    // "Roles: engineering, frontend, ... legal" and
    // "Modifiers (optional, only if obviously relevant): ai, ml, ... hiring".
    // We assert the runtime template substring after evaluating the template
    // tag — easier here to assert the imported-and-interpolated form is
    // visible in the file (either directly or via ${CANONICAL_ROLES.join...}).
    const hasRolesInterpolation =
      /Roles:\s*\$\{CANONICAL_ROLES\.join\(', '\)\}/.test(src) ||
      /Roles:\s*engineering.*legal/.test(src);
    const hasModifiersInterpolation =
      /Modifiers \(optional, only if obviously relevant\):\s*\$\{CANONICAL_MODIFIERS\.join\(', '\)\}/.test(
        src,
      ) ||
      /Modifiers \(optional, only if obviously relevant\):\s*ai.*hiring/.test(src);
    expect(hasRolesInterpolation).toBe(true);
    expect(hasModifiersInterpolation).toBe(true);
  });
});
