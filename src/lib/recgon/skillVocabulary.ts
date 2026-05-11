// Single source of truth for Recgon canonical skill vocabulary. PROFILE-02.
// Phase 1 (2026-05-12) UAT expansion: grown from 34 → ~250 tags to cover
// the long tail of real small-team skills (languages, frameworks, design
// tools, marketing channels, AI stack, data stack, product/sales practices).
//
// The vocab still has two top-level buckets — ROLES (broad job functions)
// and MODIFIERS (specifics: tools, languages, platforms, channels, practices) —
// because `prompts.ts:TAG_TASK_SKILLS_SYSTEM` interpolates them separately.
// Internal sub-groups are exposed via VOCAB_GROUPS for picker-UI grouping
// only — they are NOT used by the skill tagger or matcher.
//
// This module is pure: no Supabase, no React, no Next types. Safe in any
// runtime context.

// Roles — broad job functions. What someone DOES.
export const CANONICAL_ROLES = [
  'engineering',
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'site_reliability',
  'embedded',
  'gamedev',
  'web3',
  'design',
  'ux_design',
  'ui_design',
  'illustration',
  'motion_design',
  'marketing',
  'social_media',
  'content_writing',
  'copywriting',
  'seo',
  'ads',
  'growth',
  'lifecycle_marketing',
  'brand_strategy',
  'pr',
  'analytics',
  'data',
  'data_science',
  'ml_engineering',
  'applied_ai',
  'sales',
  'business_development',
  'account_management',
  'customer_support',
  'customer_success',
  'product',
  'product_management',
  'strategy',
  'research',
  'user_research',
  'qa',
  'technical_writing',
  'devrel',
  'finance',
  'operations',
  'legal',
  'hr',
  'recruiting',
  'leadership',
  'founding',
] as const;

// Modifiers — specifics, tools, languages, platforms, channels, practices.
// HOW someone does it. Grouped here internally; flat in the const.
const LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'dart',
  'php',
  'ruby',
  'csharp',
  'cpp',
  'c_language',
  'scala',
  'elixir',
  'haskell',
  'lua',
  'bash',
  'sql',
  'solidity',
  'r_language',
] as const;

const FRONTEND_FRAMEWORKS = [
  'react',
  'vue',
  'svelte',
  'angular',
  'nextjs',
  'nuxt',
  'remix',
  'astro',
  'sveltekit',
  'gatsby',
  'solid',
  'qwik',
  'htmx',
  'jquery',
  'tailwind',
  'shadcn',
  'mui',
  'chakra',
  'radix',
  'styled_components',
  'sass',
  'storybook',
] as const;

const BACKEND_FRAMEWORKS = [
  'nodejs',
  'express',
  'nestjs',
  'fastify',
  'hono',
  'trpc',
  'graphql',
  'rest_api',
  'django',
  'flask',
  'fastapi',
  'rails',
  'spring',
  'aspnet',
  'laravel',
  'phoenix',
  'go_fiber',
  'go_chi',
  'prisma',
  'drizzle',
  'sequelize',
  'sqlalchemy',
] as const;

const DATABASES = [
  'postgres',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'supabase',
  'firebase',
  'planetscale',
  'cockroachdb',
  'dynamodb',
  'snowflake',
  'bigquery',
  'clickhouse',
  'duckdb',
  'elasticsearch',
  'pinecone',
  'weaviate',
  'chroma',
  'qdrant',
  'neo4j',
] as const;

const MOBILE = [
  'react_native',
  'flutter',
  'swiftui',
  'jetpack_compose',
  'expo',
  'capacitor',
  'ios',
  'android',
] as const;

const CLOUD_INFRA = [
  'aws',
  'gcp',
  'azure',
  'vercel',
  'cloudflare',
  'netlify',
  'fly_io',
  'railway',
  'render',
  'heroku',
  'digitalocean',
  'docker',
  'kubernetes',
  'terraform',
  'pulumi',
  'ansible',
  'github_actions',
  'gitlab_ci',
  'circleci',
  'jenkins',
  'argocd',
  'datadog',
  'sentry',
  'grafana',
  'prometheus',
  'observability',
] as const;

const AI_ML = [
  'ai',
  'ml',
  'llm',
  'prompt_engineering',
  'rag',
  'agents',
  'embeddings',
  'fine_tuning',
  'evals',
  'vector_search',
  'openai_api',
  'anthropic_api',
  'langchain',
  'llamaindex',
  'huggingface',
  'pytorch',
  'tensorflow',
  'scikit_learn',
  'replicate',
  'ollama',
  'vercel_ai_sdk',
] as const;

const DATA_STACK = [
  'pandas',
  'numpy',
  'jupyter',
  'dbt',
  'airflow',
  'spark',
  'tableau',
  'power_bi',
  'looker',
  'metabase',
  'mode',
  'hex',
  'mixpanel',
  'amplitude',
  'segment',
  'ga4',
  'hotjar',
] as const;

const DESIGN_TOOLS = [
  'figma',
  'sketch',
  'photoshop',
  'illustrator',
  'indesign',
  'adobe_xd',
  'framer',
  'webflow',
  'miro',
  'whimsical',
  'spline',
  'rive',
  'blender',
  'cinema_4d',
  'after_effects',
  'premiere',
  'procreate',
] as const;

const MARKETING_TOOLS = [
  'hubspot',
  'mailchimp',
  'klaviyo',
  'salesforce',
  'pipedrive',
  'intercom',
  'notion',
  'wordpress',
  'shopify',
  'stripe',
  'substack',
  'beehiiv',
  'convertkit',
  'ghost',
] as const;

const MARKETING_CHANNELS = [
  'tiktok',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'reddit',
  'pinterest',
  'discord',
  'slack',
  'email_marketing',
  'paid_ads',
  'organic_growth',
  'influencer_marketing',
  'partnership_marketing',
  'event_marketing',
  'podcast',
  'newsletter',
] as const;

const PRODUCT_PRACTICES = [
  'discovery',
  'jtbd',
  'roadmapping',
  'prioritization',
  'okrs',
  'usability_testing',
  'experimentation',
  'ab_testing',
  'conversion_optimization',
  'cohort_analysis',
  'retention',
  'churn',
  'feature_flagging',
  'analytics_implementation',
] as const;

const ENG_PRACTICES = [
  'tdd',
  'code_review',
  'refactoring',
  'performance',
  'microservices',
  'serverless',
  'event_driven',
  'websockets',
  'webrtc',
  'oauth',
  'sso',
  'encryption',
  'accessibility',
  'i18n',
  'security',
  'testing',
] as const;

const DOMAIN_SKILLS = [
  'branding',
  'community',
  'partnerships',
  'video',
  'photo',
  'fundraising',
  'hiring',
] as const;

export const CANONICAL_MODIFIERS = [
  ...LANGUAGES,
  ...FRONTEND_FRAMEWORKS,
  ...BACKEND_FRAMEWORKS,
  ...DATABASES,
  ...MOBILE,
  ...CLOUD_INFRA,
  ...AI_ML,
  ...DATA_STACK,
  ...DESIGN_TOOLS,
  ...MARKETING_TOOLS,
  ...MARKETING_CHANNELS,
  ...PRODUCT_PRACTICES,
  ...ENG_PRACTICES,
  ...DOMAIN_SKILLS,
] as const;

// Union of roles + modifiers. The universal predicate for any tag emitted
// by the tagger or typed by the user.
export const CANONICAL_VOCAB = [
  ...CANONICAL_ROLES,
  ...CANONICAL_MODIFIERS,
] as const;

export type CanonicalTag = typeof CANONICAL_VOCAB[number];

export const CANONICAL_SET: Set<string> = new Set<string>(CANONICAL_VOCAB);

export function isCanonical(tag: string): tag is CanonicalTag {
  return CANONICAL_SET.has(tag);
}

// Picker-UI-only grouping. Each entry is { label, tags }. The order here
// is the display order in the dropdown. Tagger + matcher do NOT use this —
// it's purely a presentation aid so the picker doesn't feel like a flat
// 250-item list.
export const VOCAB_GROUPS: ReadonlyArray<{ label: string; tags: readonly string[] }> = [
  { label: 'Roles', tags: CANONICAL_ROLES },
  { label: 'Languages', tags: LANGUAGES },
  { label: 'Frontend', tags: FRONTEND_FRAMEWORKS },
  { label: 'Backend', tags: BACKEND_FRAMEWORKS },
  { label: 'Databases', tags: DATABASES },
  { label: 'Mobile', tags: MOBILE },
  { label: 'Cloud & DevOps', tags: CLOUD_INFRA },
  { label: 'AI & ML', tags: AI_ML },
  { label: 'Data', tags: DATA_STACK },
  { label: 'Design tools', tags: DESIGN_TOOLS },
  { label: 'Marketing tools', tags: MARKETING_TOOLS },
  { label: 'Marketing channels', tags: MARKETING_CHANNELS },
  { label: 'Product practices', tags: PRODUCT_PRACTICES },
  { label: 'Engineering practices', tags: ENG_PRACTICES },
  { label: 'Other', tags: DOMAIN_SKILLS },
];

// Display-only humanization. Storage stays snake_case lowercase. The picker
// and pill rendering use this for the user-facing label.
const DISPLAY_OVERRIDES: Record<string, string> = {
  // Acronyms
  ai: 'AI',
  ml: 'ML',
  llm: 'LLM',
  rag: 'RAG',
  ui: 'UI',
  ux: 'UX',
  qa: 'QA',
  hr: 'HR',
  pr: 'PR',
  seo: 'SEO',
  sql: 'SQL',
  sso: 'SSO',
  tdd: 'TDD',
  jtbd: 'JTBD',
  okrs: 'OKRs',
  ga4: 'GA4',
  // Cloud
  aws: 'AWS',
  gcp: 'GCP',
  // Mobile
  ios: 'iOS',
  // Languages — special casings
  csharp: 'C#',
  cpp: 'C++',
  c_language: 'C',
  r_language: 'R',
  // Frameworks — official spellings
  nodejs: 'Node.js',
  nextjs: 'Next.js',
  nuxt: 'Nuxt.js',
  sveltekit: 'SvelteKit',
  nestjs: 'NestJS',
  trpc: 'tRPC',
  fastapi: 'FastAPI',
  aspnet: 'ASP.NET',
  graphql: 'GraphQL',
  rest_api: 'REST API',
  styled_components: 'styled-components',
  mui: 'MUI',
  // Tools
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
  cockroachdb: 'CockroachDB',
  dynamodb: 'DynamoDB',
  bigquery: 'BigQuery',
  clickhouse: 'ClickHouse',
  duckdb: 'DuckDB',
  planetscale: 'PlanetScale',
  digitalocean: 'DigitalOcean',
  fly_io: 'Fly.io',
  github_actions: 'GitHub Actions',
  gitlab_ci: 'GitLab CI',
  circleci: 'CircleCI',
  argocd: 'ArgoCD',
  power_bi: 'Power BI',
  scikit_learn: 'scikit-learn',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  huggingface: 'Hugging Face',
  langchain: 'LangChain',
  llamaindex: 'LlamaIndex',
  openai_api: 'OpenAI API',
  anthropic_api: 'Anthropic API',
  vercel_ai_sdk: 'Vercel AI SDK',
  // Design
  adobe_xd: 'Adobe XD',
  after_effects: 'After Effects',
  cinema_4d: 'Cinema 4D',
  indesign: 'InDesign',
  // Mobile
  react_native: 'React Native',
  swiftui: 'SwiftUI',
  jetpack_compose: 'Jetpack Compose',
  // Roles
  ux_design: 'UX Design',
  ui_design: 'UI Design',
  motion_design: 'Motion Design',
  data_science: 'Data Science',
  ml_engineering: 'ML Engineering',
  applied_ai: 'Applied AI',
  product_management: 'Product Management',
  user_research: 'User Research',
  site_reliability: 'Site Reliability',
  business_development: 'Business Development',
  account_management: 'Account Management',
  customer_support: 'Customer Support',
  customer_success: 'Customer Success',
  technical_writing: 'Technical Writing',
  social_media: 'Social Media',
  content_writing: 'Content Writing',
  brand_strategy: 'Brand Strategy',
  lifecycle_marketing: 'Lifecycle Marketing',
  prompt_engineering: 'Prompt Engineering',
  email_marketing: 'Email Marketing',
  paid_ads: 'Paid Ads',
  organic_growth: 'Organic Growth',
  influencer_marketing: 'Influencer Marketing',
  partnership_marketing: 'Partnership Marketing',
  event_marketing: 'Event Marketing',
  ab_testing: 'A/B Testing',
  conversion_optimization: 'Conversion Optimization',
  cohort_analysis: 'Cohort Analysis',
  feature_flagging: 'Feature Flagging',
  analytics_implementation: 'Analytics Implementation',
  usability_testing: 'Usability Testing',
  // Eng practices
  code_review: 'Code Review',
  event_driven: 'Event-Driven',
  webrtc: 'WebRTC',
  websockets: 'WebSockets',
  i18n: 'i18n',
  // Misc
  gamedev: 'Game Dev',
  web3: 'Web3',
  vector_search: 'Vector Search',
  fine_tuning: 'Fine-Tuning',
  go_fiber: 'Fiber (Go)',
  go_chi: 'Chi (Go)',
  devrel: 'DevRel',
  pr_short: 'PR',
};

export function humanizeTag(tag: string): string {
  if (DISPLAY_OVERRIDES[tag]) return DISPLAY_OVERRIDES[tag];
  return tag
    .split('_')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}
