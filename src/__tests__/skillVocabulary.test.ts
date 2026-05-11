// Phase 1 / PROFILE-02: Single source of truth for Recgon canonical skill vocab.
// Originally landed in Plan 01-01 with a narrow 34-tag list (25 roles + 9
// modifiers) lifted verbatim from `prompts.ts:893-895`. Expanded during
// UAT (2026-05-12) after the picker felt anaemic — now ~90 tags covering
// concrete languages, frameworks, tools, platforms, and channels.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANONICAL_ROLES,
  CANONICAL_MODIFIERS,
  CANONICAL_VOCAB,
  CANONICAL_SET,
  isCanonical,
  humanizeTag,
} from '../lib/recgon/skillVocabulary';

// Anchor tags — these MUST stay in the vocab even as it evolves. Removing
// any of them would silently break dispatcher Jaccard math on existing
// task/teammate rows that carry these tags. Adding new tags is fine.
const REQUIRED_ROLES = [
  'engineering',
  'frontend',
  'backend',
  'design',
  'marketing',
  'product',
  'qa',
  'data',
];

const REQUIRED_MODIFIERS = [
  'ai',
  'ml',
  'react',
  'typescript',
  'python',
  'figma',
  'aws',
];

describe('skillVocabulary', () => {
  it('CANONICAL_ROLES contains every anchor role', () => {
    for (const role of REQUIRED_ROLES) {
      expect(CANONICAL_ROLES).toContain(role);
    }
  });

  it('CANONICAL_MODIFIERS contains every anchor modifier', () => {
    for (const mod of REQUIRED_MODIFIERS) {
      expect(CANONICAL_MODIFIERS).toContain(mod);
    }
  });

  it('CANONICAL_VOCAB equals [...roles, ...modifiers] with no duplicates', () => {
    expect(CANONICAL_VOCAB).toEqual([...CANONICAL_ROLES, ...CANONICAL_MODIFIERS]);
    expect(new Set(CANONICAL_VOCAB).size).toBe(CANONICAL_VOCAB.length);
  });

  it('CANONICAL_SET is a Set; isCanonical() reflects membership', () => {
    expect(CANONICAL_SET).toBeInstanceOf(Set);
    expect(isCanonical('engineering')).toBe(true);
    expect(isCanonical('frontend')).toBe(true);
    expect(isCanonical('react')).toBe(true);
    expect(isCanonical('react_native')).toBe(true);
    expect(isCanonical('nodejs')).toBe(true);
    expect(isCanonical('not_a_real_tag_12345')).toBe(false);
    expect(isCanonical('')).toBe(false);
  });

  it('all tags are stored lowercase snake_case', () => {
    for (const tag of CANONICAL_VOCAB) {
      expect(tag).toBe(tag.toLowerCase());
      expect(tag).not.toMatch(/\s/);
    }
  });

  it('TAG_TASK_SKILLS_SYSTEM still interpolates the canonical lists after expansion', () => {
    const promptsPath = resolve(__dirname, '../lib/prompts.ts');
    const src = readFileSync(promptsPath, 'utf8');
    const hasRolesInterpolation = /Roles:\s*\$\{CANONICAL_ROLES\.join\(', '\)\}/.test(src);
    const hasModifiersInterpolation =
      /Modifiers \(optional, only if obviously relevant\):\s*\$\{CANONICAL_MODIFIERS\.join\(', '\)\}/.test(
        src,
      );
    expect(hasRolesInterpolation).toBe(true);
    expect(hasModifiersInterpolation).toBe(true);
  });

  describe('humanizeTag', () => {
    it('capitalizes single-word tags', () => {
      expect(humanizeTag('engineering')).toBe('Engineering');
      expect(humanizeTag('marketing')).toBe('Marketing');
      expect(humanizeTag('design')).toBe('Design');
    });

    it('humanizes snake_case to Title Case Words', () => {
      expect(humanizeTag('social_media')).toBe('Social Media');
      expect(humanizeTag('customer_support')).toBe('Customer Support');
      expect(humanizeTag('content_writing')).toBe('Content Writing');
    });

    it('uses explicit overrides for acronyms and special casings', () => {
      expect(humanizeTag('ai')).toBe('AI');
      expect(humanizeTag('ml')).toBe('ML');
      expect(humanizeTag('seo')).toBe('SEO');
      expect(humanizeTag('aws')).toBe('AWS');
      expect(humanizeTag('ios')).toBe('iOS');
      expect(humanizeTag('csharp')).toBe('C#');
      expect(humanizeTag('nodejs')).toBe('Node.js');
      expect(humanizeTag('nextjs')).toBe('Next.js');
      expect(humanizeTag('react_native')).toBe('React Native');
      expect(humanizeTag('ux_design')).toBe('UX Design');
    });

    it('falls back to Title Case for unknown tags (custom user input)', () => {
      expect(humanizeTag('webflow')).toBe('Webflow');
      expect(humanizeTag('custom_skill')).toBe('Custom Skill');
    });
  });
});
