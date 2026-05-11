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

// Roles — broad job functions. What someone DOES.
export const CANONICAL_ROLES = [
  'engineering',
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'design',
  'ux_design',
  'ui_design',
  'marketing',
  'social_media',
  'content_writing',
  'copywriting',
  'seo',
  'ads',
  'growth',
  'analytics',
  'data',
  'data_science',
  'sales',
  'customer_support',
  'product',
  'product_management',
  'strategy',
  'research',
  'qa',
  'finance',
  'operations',
  'legal',
  'hr',
] as const;

// Modifiers — specifics, tools, languages, platforms. HOW someone does it.
export const CANONICAL_MODIFIERS = [
  // AI / ML
  'ai',
  'ml',
  'llm',
  'prompt_engineering',
  'rag',
  'agents',
  // Languages
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'php',
  'ruby',
  'csharp',
  'sql',
  // Frontend frameworks
  'react',
  'vue',
  'svelte',
  'angular',
  'nextjs',
  'tailwind',
  // Backend / data
  'nodejs',
  'django',
  'rails',
  'fastapi',
  'graphql',
  'rest_api',
  'postgres',
  'mongodb',
  'redis',
  'supabase',
  'firebase',
  // Mobile
  'react_native',
  'ios',
  'android',
  // Cloud / infra
  'aws',
  'gcp',
  'azure',
  'vercel',
  'cloudflare',
  'docker',
  'kubernetes',
  // Design tools
  'figma',
  'sketch',
  'photoshop',
  'illustrator',
  'framer',
  'after_effects',
  // Marketing channels & specifics
  'tiktok',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'email_marketing',
  'paid_ads',
  'organic_growth',
  'branding',
  'community',
  'partnerships',
  // Domain skills
  'video',
  'photo',
  'fundraising',
  'hiring',
  'accessibility',
  'i18n',
  'security',
  'testing',
  'devrel',
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

// Display-only humanization. Storage stays snake_case lowercase. The picker
// and pill rendering use this for the user-facing label.
const DISPLAY_OVERRIDES: Record<string, string> = {
  ai: 'AI',
  ml: 'ML',
  llm: 'LLM',
  rag: 'RAG',
  ui: 'UI',
  ux: 'UX',
  qa: 'QA',
  hr: 'HR',
  seo: 'SEO',
  sql: 'SQL',
  aws: 'AWS',
  gcp: 'GCP',
  ios: 'iOS',
  devrel: 'DevRel',
  i18n: 'i18n',
  csharp: 'C#',
  nodejs: 'Node.js',
  nextjs: 'Next.js',
  fastapi: 'FastAPI',
  graphql: 'GraphQL',
  postgres: 'PostgreSQL',
  mongodb: 'MongoDB',
  rest_api: 'REST API',
  react_native: 'React Native',
  after_effects: 'After Effects',
  ux_design: 'UX Design',
  ui_design: 'UI Design',
  data_science: 'Data Science',
  product_management: 'Product Management',
  social_media: 'Social Media',
  content_writing: 'Content Writing',
  customer_support: 'Customer Support',
  prompt_engineering: 'Prompt Engineering',
  email_marketing: 'Email Marketing',
  paid_ads: 'Paid Ads',
  organic_growth: 'Organic Growth',
  tiktok: 'TikTok',
};

export function humanizeTag(tag: string): string {
  if (DISPLAY_OVERRIDES[tag]) return DISPLAY_OVERRIDES[tag];
  return tag
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
