export const STAGE_LABEL: Record<string, { label: string; tone: string }> = {
  idea:   { label: 'idea',   tone: '#a78bfa' },
  mvp:    { label: 'mvp',    tone: '#f59e0b' },
  beta:   { label: 'beta',   tone: '#3b82f6' },
  growth: { label: 'growth', tone: '#10b981' },
  mature: { label: 'mature', tone: '#9ca3af' },
};

export const SOURCE_LABEL: Record<string, string> = {
  codebase: 'codebase',
  github:   'github',
  description: 'idea',
};

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function splitHeadline(text: string): { headline: string; rest: string } {
  const trimmed = text.trim();
  const m = trimmed.match(/^(.+?[.!?])(\s+|$)/);
  if (m && m[1].length < trimmed.length - 8) {
    return { headline: m[1].trim(), rest: trimmed.slice(m[0].length).trim() };
  }
  return { headline: trimmed, rest: '' };
}

export function extractTags(text: string, dictionary: string[]): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const term of dictionary) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) found.add(term);
  }
  return Array.from(found);
}

export const PAIN_DICT = [
  'time', 'budget', 'expertise', 'overwhelm', 'overwhelmed', 'lack', 'missed', 'inefficien',
  'fail', 'product-market fit', 'pmf', 'growth', 'cost', 'complexity', 'scaling',
  'churn', 'retention', 'acquisition', 'feedback', 'strategy', 'marketing', 'analytics',
  'manual', 'slow', 'expensive', 'fragment', 'silo',
];

export const AUDIENCE_DICT = [
  'solo', 'founder', 'founders', 'startup', 'startups', 'early-stage', 'early stage',
  'mvp', 'small team', 'small teams', 'product manager', 'pm', 'marketer', 'developer',
  'engineer', 'designer', 'team', 'enterprise', 'agency', 'consultant', 'creator',
  'indie', 'bootstrap', 'bootstrapped',
];

export const STACK_CATEGORIES: Array<{ key: string; label: string; tone: string; match: RegExp }> = [
  { key: 'fonts',     label: 'fonts',      tone: '#cbd5e1', match: /\(font\)|\bgoogle fonts\b/i },
  { key: 'icons',     label: 'icons',      tone: '#94a3b8', match: /\b(lucide|tabler|heroicons|phosphor|feather|font-awesome)/i },
  { key: 'viz',       label: 'data viz',   tone: '#06b6d4', match: /(recharts|\bd3\b|chart\.?js|\bvisx\b|\bnivo\b|@react-three|@number-flow|\bthree\b|three\.js)/i },
  { key: 'auth',      label: 'auth',       tone: '#f59e0b', match: /\b(nextauth|next-auth|auth\.?js|clerk|kinde|oauth|jwt)\b/i },
  { key: 'data',      label: 'data',       tone: '#10b981', match: /\b(supabase|postgres|postgresql|sqlite|mongo|mysql|redis|prisma|drizzle|dynamodb|firestore|storage)\b/i },
  { key: 'ai',        label: 'ai / llm',   tone: '#a78bfa', match: /\b(gemini|claude|openai|anthropic|gpt|llama|mistral|llm|huggingface|langchain)\b/i },
  { key: 'tooling',   label: 'tooling',    tone: '#3b82f6', match: /\b(eslint|prettier|vitest|jest|playwright|webpack|vite|turbo|biome|husky)\b/i },
  { key: 'framework', label: 'framework',  tone: '#ec4899', match: /\b(next\.?js|nuxt|astro|remix|solid|svelte|angular|vue)\b/i },
  { key: 'language',  label: 'language',   tone: '#f472b6', match: /\b(typescript|javascript|python|rust|go|swift|kotlin|java|ruby|php)\b/i },
];

export function categorizeTech(name: string): { key: string; label: string; tone: string } {
  for (const c of STACK_CATEGORIES) {
    if (c.match.test(name)) return { key: c.key, label: c.label, tone: c.tone };
  }
  return { key: 'other', label: 'other', tone: '#6b7280' };
}
