import { z } from 'zod';
import { chat } from '../gemini';
import { logger } from '../logger';
import { parseAIResponse } from '../schemas';
import type { ChatOptions } from './providers';

export type LLMTaskKind =
  | 'codebase_analysis'
  | 'idea_analysis'
  | 'feedback_analysis'
  | 'marketing_content'
  | 'campaign_plan'
  | 'analytics_insights'
  | 'competitor_analysis'
  | 'social_analysis'
  | 'overview_brief'
  | 'mentor_chat';

export const PROMPT_VERSIONS: Record<LLMTaskKind, string> = {
  codebase_analysis: '2026-04-25.grounded-v1',
  idea_analysis: '2026-04-25.grounded-v1',
  feedback_analysis: '2026-04-25.actionable-v1',
  marketing_content: '2026-04-25.platform-v1',
  campaign_plan: '2026-04-25.tactical-v1',
  analytics_insights: '2026-04-25.data-backed-v1',
  competitor_analysis: '2026-04-25.evidence-v1',
  social_analysis: '2026-04-25.evidence-v1',
  overview_brief: '2026-04-25.focus-v1',
  mentor_chat: '2026-04-25.grounded-v1',
};

export type QualityProfile = 'analysis' | 'feedback' | 'marketing' | 'campaign' | 'analytics' | 'competitor' | 'social' | 'brief';

export class AIQualityError extends Error {
  constructor(
    public readonly taskKind: LLMTaskKind,
    public readonly issues: string[],
  ) {
    super(`AI output failed ${taskKind} quality checks: ${issues.join('; ')}`);
    this.name = 'AIQualityError';
  }
}

type StructuredOutputArgs<T> = {
  taskKind: LLMTaskKind;
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  options?: ChatOptions;
  qualityProfile?: QualityProfile;
  allowRepairRetry?: boolean;
};

const GENERIC_PHRASES = [
  'improve ux',
  'improve user experience',
  'do marketing',
  'increase awareness',
  'track metrics',
  'engage users',
  'build community',
  'leverage social media',
  'optimize performance',
  'add more features',
];

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(textOf).join('\n');
  return '';
}

function hasGenericFiller(value: string): boolean {
  const normalized = value.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

function addStringArrayIssues(issues: string[], label: string, values: unknown, minItems: number, minWords = 3) {
  if (!Array.isArray(values)) return;
  if (values.length < minItems) issues.push(`${label} should include at least ${minItems} items`);
  values.forEach((item, index) => {
    if (typeof item !== 'string') return;
    const words = item.trim().split(/\s+/).filter(Boolean);
    if (words.length < minWords) issues.push(`${label}[${index}] is too thin`);
    if (hasGenericFiller(item) && words.length < 10) issues.push(`${label}[${index}] is generic without concrete detail`);
  });
}

function validateAnalysis(output: Record<string, unknown>, taskKind: LLMTaskKind): string[] {
  const issues: string[] = [];
  addStringArrayIssues(issues, 'features', output.features, taskKind === 'idea_analysis' ? 1 : 3);
  addStringArrayIssues(issues, 'topRisks', output.topRisks, 3, 4);
  addStringArrayIssues(issues, 'prioritizedNextSteps', output.prioritizedNextSteps, 5, 6);
  addStringArrayIssues(issues, 'growthMetrics', output.growthMetrics, 4, 4);
  for (const field of ['description', 'targetAudience', 'problemStatement', 'marketOpportunity', 'gtmStrategy']) {
    const value = output[field];
    if (typeof value === 'string' && value.trim().split(/\s+/).length < 8) {
      issues.push(`${field} is too short to be useful`);
    }
  }
  return issues;
}

function validateFeedback(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const breakdown = output.sentimentBreakdown as Record<string, unknown> | undefined;
  if (breakdown) {
    const total = Number(breakdown.positive) + Number(breakdown.neutral) + Number(breakdown.negative);
    if (!Number.isFinite(total) || Math.abs(total - 100) > 2) {
      issues.push('sentimentBreakdown should total approximately 100');
    }
  }
  if (typeof output.summary === 'string' && output.summary.trim().split(/\s+/).length < 18) {
    issues.push('summary should explain the main pattern, friction, and positive signal');
  }
  addStringArrayIssues(issues, 'themes', output.themes, 1, 2);
  addStringArrayIssues(issues, 'developerPrompts', output.developerPrompts, 1, 10);
  const prompts = Array.isArray(output.developerPrompts) ? output.developerPrompts : [];
  prompts.forEach((prompt, index) => {
    if (typeof prompt !== 'string') return;
    const lower = prompt.toLowerCase();
    if (!/(implement|fix|add|update|change|refactor|create|remove|handle|validate|persist|surface)/.test(lower)) {
      issues.push(`developerPrompts[${index}] lacks an implementation verb`);
    }
    if (!/(user|customer|feedback|expects|reported|requested|frustrated|confused)/.test(lower)) {
      issues.push(`developerPrompts[${index}] does not preserve user context`);
    }
  });
  return issues;
}

function validateMarketing(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const field of ['headline1', 'headline2', 'headline3']) {
    const value = output[field];
    if (typeof value === 'string' && value.length > 30) issues.push(`${field} exceeds 30 characters`);
  }
  for (const field of ['description1', 'description2']) {
    const value = output[field];
    if (typeof value === 'string' && value.length > 90) issues.push(`${field} exceeds 90 characters`);
  }
  if (typeof output.caption === 'string' && output.caption.trim().split(/\s+/).length < 12) {
    issues.push('caption is too thin for useful social content');
  }
  if (hasGenericFiller(textOf(output))) issues.push('marketing output contains generic filler');
  return issues;
}

function validateCampaign(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  addStringArrayIssues(issues, 'keyMessages', output.keyMessages, 4, 4);
  addStringArrayIssues(issues, 'quickWins', output.quickWins, 3, 5);
  if (Array.isArray(output.contentCalendar) && output.contentCalendar.length < 8) {
    issues.push('contentCalendar should include at least 8 campaign items');
  }
  if (hasGenericFiller(textOf(output))) issues.push('campaign plan contains generic filler');
  return issues;
}

function validateAnalytics(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  addStringArrayIssues(issues, 'keyInsights', output.keyInsights, 3, 5);
  addStringArrayIssues(issues, 'recommendations', output.recommendations, 4, 5);
  const insightText = textOf([output.summary, output.keyInsights, output.topWin, output.topConcern]);
  if (!/\d/.test(insightText) && output.overallPerformance !== 'insufficient_data') {
    issues.push('analytics insights should mention actual numbers when data is sufficient');
  }
  return issues;
}

function validateCompetitor(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const insights = output.insights;
  if (Array.isArray(insights) && insights.length === 0) issues.push('insights should not be empty');
  if (Array.isArray(insights)) {
    insights.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const row = item as Record<string, unknown>;
      addStringArrayIssues(issues, `insights[${index}].keyFeatures`, row.keyFeatures, 2, 2);
      addStringArrayIssues(issues, `insights[${index}].weaknesses`, row.weaknesses, 1, 3);
      if (typeof row.differentiator === 'string' && row.differentiator.trim().split(/\s+/).length < 8) {
        issues.push(`insights[${index}].differentiator is too thin`);
      }
    });
  }
  return issues;
}

function validateSocial(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const profiles = output.profiles;
  if (Array.isArray(profiles) && profiles.length === 0) issues.push('profiles should not be empty');
  if (Array.isArray(profiles)) {
    profiles.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const row = item as Record<string, unknown>;
      if (row.contentStyle !== 'Profile content could not be accessed') {
        addStringArrayIssues(issues, `profiles[${index}].strengths`, row.strengths, 1, 3);
        addStringArrayIssues(issues, `profiles[${index}].improvements`, row.improvements, 1, 5);
      }
    });
  }
  if (typeof output.overallSummary === 'string' && output.overallSummary.trim().split(/\s+/).length < 12) {
    issues.push('overallSummary should identify the main social priority');
  }
  return issues;
}

function validateBrief(output: Record<string, unknown>): string[] {
  const issues: string[] = [];
  for (const field of ['brief', 'focusArea']) {
    const value = output[field];
    if (typeof value === 'string' && value.trim().split(/\s+/).length < 8) issues.push(`${field} is too short`);
  }
  if (hasGenericFiller(textOf(output))) issues.push('brief contains generic filler');
  return issues;
}

export function validateAIQuality(taskKind: LLMTaskKind, output: unknown, profile?: QualityProfile): string[] {
  if (!output || typeof output !== 'object') return ['output is not an object'];
  const obj = output as Record<string, unknown>;
  const effectiveProfile = profile ?? defaultQualityProfile(taskKind);

  switch (effectiveProfile) {
    case 'analysis':
      return validateAnalysis(obj, taskKind);
    case 'feedback':
      return validateFeedback(obj);
    case 'marketing':
      return validateMarketing(obj);
    case 'campaign':
      return validateCampaign(obj);
    case 'analytics':
      return validateAnalytics(obj);
    case 'competitor':
      return validateCompetitor(obj);
    case 'social':
      return validateSocial(obj);
    case 'brief':
      return validateBrief(obj);
    default:
      return [];
  }
}

function defaultQualityProfile(taskKind: LLMTaskKind): QualityProfile | undefined {
  if (taskKind === 'codebase_analysis' || taskKind === 'idea_analysis') return 'analysis';
  if (taskKind === 'feedback_analysis') return 'feedback';
  if (taskKind === 'marketing_content') return 'marketing';
  if (taskKind === 'campaign_plan') return 'campaign';
  if (taskKind === 'analytics_insights') return 'analytics';
  if (taskKind === 'competitor_analysis') return 'competitor';
  if (taskKind === 'social_analysis') return 'social';
  if (taskKind === 'overview_brief') return 'brief';
  return undefined;
}

export function parseAndValidateAIResponse<T>(
  raw: string,
  schema: z.ZodType<T>,
  taskKind: LLMTaskKind,
  qualityProfile?: QualityProfile,
): T {
  const parsed = parseAIResponse(raw, schema);
  const issues = validateAIQuality(taskKind, parsed, qualityProfile);
  if (issues.length > 0) throw new AIQualityError(taskKind, issues);
  return parsed;
}

function repairUserPrompt(raw: string, issues: string[], originalUserPrompt: string): string {
  return `Your previous JSON response was invalid or too low-quality for this task.

QUALITY ISSUES:
${issues.map((issue) => `- ${issue}`).join('\n')}

Return the same JSON shape, but fix the issues. Keep it grounded in the original input. Do not add markdown or prose.

ORIGINAL INPUT:
${originalUserPrompt}

PREVIOUS RESPONSE:
${raw.slice(0, 12000)}`;
}

export async function generateStructuredOutput<T>({
  taskKind,
  schema,
  systemPrompt,
  userPrompt,
  options,
  qualityProfile,
  allowRepairRetry = true,
}: StructuredOutputArgs<T>): Promise<T> {
  const promptVersion = options?.promptVersion ?? PROMPT_VERSIONS[taskKind];
  const metadataOptions: ChatOptions = {
    ...options,
    taskKind,
    promptVersion,
    qualityProfile: qualityProfile ?? options?.qualityProfile,
    allowRepairRetry,
  };

  const raw = await chat(systemPrompt, userPrompt, metadataOptions);
  try {
    const parsed = parseAndValidateAIResponse(raw, schema, taskKind, qualityProfile);
    logger.info('llm structured output accepted', { taskKind, promptVersion, repaired: false });
    return parsed;
  } catch (err) {
    if (!allowRepairRetry) throw err;
    const issues = err instanceof AIQualityError ? err.issues : [err instanceof Error ? err.message : String(err)];
    logger.warn('llm structured output rejected, attempting repair', {
      taskKind,
      promptVersion,
      issues: issues.slice(0, 8),
    });

    const repairedRaw = await chat(
      systemPrompt,
      repairUserPrompt(raw, issues, userPrompt),
      {
        ...metadataOptions,
        temperature: Math.min(options?.temperature ?? 0.4, 0.2),
        allowRepairRetry: false,
      },
    );
    const parsed = parseAndValidateAIResponse(repairedRaw, schema, taskKind, qualityProfile);
    logger.info('llm structured output accepted', { taskKind, promptVersion, repaired: true });
    return parsed;
  }
}
