import { supabase } from './supabase';

function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String(error.message ?? '').toLowerCase() : '';
  return (
    message.includes('column')
    && message.includes(column.toLowerCase())
    && (message.includes('does not exist') || message.includes('schema cache'))
  );
}

// --- Next.js cache helpers (guarded for MCP server / test contexts) ---

function tryRevalidate(...tags: string[]): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { revalidateTag } = require('next/cache') as { revalidateTag: (tag: string) => void };
    tags.forEach(revalidateTag);
  } catch {
    // Not in a Next.js context (MCP server, tests) — safe to ignore
  }
}

function cachedOr<R>(
  fn: () => Promise<R>,
  key: string[],
  tags: string[],
  revalidate = 60,
): Promise<R> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unstable_cache } = require('next/cache') as typeof import('next/cache');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (unstable_cache as any)(fn, key, { tags, revalidate })();
  } catch {
    return fn();
  }
}

// -------------------------------------------------------------------

export interface Project {
  id: string;
  teamId: string;
  createdBy: string;
  name: string;
  path?: string;
  sourceType?: 'codebase' | 'github' | 'description';
  description?: string;
  isGithub?: boolean;
  githubUrl?: string;
  lastAnalyzedCommitSha?: string;
  isShared?: boolean;
  createdAt: string;
  analysis?: ProductAnalysis;
  marketingContent?: MarketingContent[];
  feedbackAnalyses?: FeedbackAnalysis[];
  campaigns?: Campaign[];
  socialProfiles?: { platform: string; url: string }[];
  analyticsPropertyId?: string;
}

export interface ProductAnalysis {
  // Core identity
  name: string;
  description: string;
  techStack: string[];
  features: string[];
  targetAudience: string;
  uniqueSellingPoints: string[];

  // Problem & market
  problemStatement: string;
  marketOpportunity: string;
  competitors: { name: string; url?: string; differentiator: string }[];
  competitorInsights?: import('./schemas').CompetitorInsight[];

  // Business model
  businessModel: string;
  revenueStreams: string[];
  pricingSuggestion: string;

  // Product maturity
  currentStage: 'idea' | 'mvp' | 'beta' | 'growth' | 'mature';

  // Strategic analysis
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  topRisks: string[];

  // Actionable guidance
  prioritizedNextSteps: string[];
  gtmStrategy: string;
  earlyAdopterChannels: string[];
  growthMetrics: string[];

  // Update-only: populated on diff-based re-analysis
  improvements?: string[];
  nextStepsTaken?: { step: string; taken: boolean; evidence: string }[];

  analyzedAt: string;
}

export interface MarketingContent {
  id: string;
  platform: string;
  content: Record<string, string>;
  generatedAt: string;
}

export interface Campaign {
  id: string;
  type: string;
  goal: string;
  duration: string;
  name: string;
  plan: Record<string, unknown>;
  createdAt: string;
}

export interface FeedbackAnalysis {
  id: string;
  rawFeedback: string[];
  sentiment: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  themes: string[];
  featureRequests: string[];
  bugs: string[];
  praises: string[];
  developerPrompts: string[];
  analyzedAt: string;
  completedPrompts?: { promptIndex: number; completedAt: string; completedBy: string }[];
}

// Single embedded select that fetches all related rows in one HTTP request.
// PostgREST follows FK relationships declared in the database schema.
const PROJECT_SELECT = `
  *,
  project_analyses ( data, analyzed_at ),
  marketing_content ( * ),
  feedback_analyses ( * ),
  campaigns ( * )
`.trim();

type EmbeddedRow = Record<string, unknown> & {
  project_analyses: Array<{ data: unknown; analyzed_at: string }> | null;
  marketing_content: Array<Record<string, unknown>> | null;
  feedback_analyses: Array<Record<string, unknown>> | null;
  campaigns: Array<Record<string, unknown>> | null;
};

function mapProjectRow(row: EmbeddedRow): Project {
  const analysisArr = row.project_analyses;
  const analysis: ProductAnalysis | undefined = analysisArr && analysisArr.length > 0
    ? { ...(analysisArr[0].data as ProductAnalysis), analyzedAt: analysisArr[0].analyzed_at }
    : undefined;

  const marketingContent: MarketingContent[] = (row.marketing_content ?? [])
    .map((r) => ({
      id: r.id as string,
      platform: r.platform as string,
      content: r.content as Record<string, string>,
      generatedAt: r.generated_at as string,
    }))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

  const feedbackAnalyses: FeedbackAnalysis[] = (row.feedback_analyses ?? [])
    .map((r) => ({
      id: r.id as string,
      rawFeedback: r.raw_feedback as string[],
      sentiment: r.sentiment as string,
      sentimentBreakdown: r.sentiment_breakdown as FeedbackAnalysis['sentimentBreakdown'],
      themes: r.themes as string[],
      featureRequests: r.feature_requests as string[],
      bugs: r.bugs as string[],
      praises: r.praises as string[],
      developerPrompts: r.developer_prompts as string[],
      analyzedAt: r.analyzed_at as string,
      completedPrompts: (r.completed_prompts as FeedbackAnalysis['completedPrompts']) ?? [],
    }))
    .sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());

  const campaigns: Campaign[] = (row.campaigns ?? [])
    .map((r) => ({
      id: r.id as string,
      type: r.type as string,
      goal: r.goal as string,
      duration: r.duration as string,
      name: r.name as string,
      plan: r.plan as Record<string, unknown>,
      createdAt: r.created_at as string,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    id: row.id as string,
    teamId: row.team_id as string,
    createdBy: row.created_by as string,
    name: row.name as string,
    path: row.path as string | undefined,
    sourceType: ((row.source_type as string) ?? 'codebase') as Project['sourceType'],
    description: row.description as string | undefined,
    isGithub: row.is_github as boolean | undefined,
    githubUrl: row.github_url as string | undefined,
    lastAnalyzedCommitSha: row.last_analyzed_commit_sha as string | undefined,
    isShared: (row.is_shared as boolean | null) ?? true,
    createdAt: row.created_at as string,
    socialProfiles: (row.social_profiles as { platform: string; url: string }[]) ?? [],
    analyticsPropertyId: row.analytics_property_id as string | undefined,
    analysis,
    marketingContent: marketingContent.length > 0 ? marketingContent : undefined,
    feedbackAnalyses: feedbackAnalyses.length > 0 ? feedbackAnalyses : undefined,
    campaigns: campaigns.length > 0 ? campaigns : undefined,
  };
}

/**
 * List projects in a team, applying per-project privacy:
 * shared projects are returned to all team members; unshared projects are
 * returned only to their creator. Pass the acting user's id to enforce this.
 */
async function _getAllProjects(teamId: string, userId?: string): Promise<Project[]> {
  let data: EmbeddedRow[] | null;
  let error: { message: string } | null;

  const base = supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (userId) {
    const result = await base.or(`is_shared.eq.true,created_by.eq.${userId}`);
    data = result.data as unknown as EmbeddedRow[] | null;
    error = result.error;
  } else {
    const result = await base;
    data = result.data as unknown as EmbeddedRow[] | null;
    error = result.error;
  }

  // Backward-compatibility for databases that haven't added projects.is_shared yet.
  if (error && isMissingColumnError(error, 'is_shared')) {
    const fallback = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    data = fallback.data as unknown as EmbeddedRow[] | null;
    error = fallback.error;
  }

  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  if (!data || data.length === 0) return [];
  return data.map(mapProjectRow);
}

export function getAllProjects(teamId: string, userId?: string): Promise<Project[]> {
  return cachedOr(
    () => _getAllProjects(teamId, userId),
    ['getAllProjects', teamId, userId ?? 'anon'],
    [`team:${teamId}`],
  );
}

async function _getProject(id: string, teamId: string, userId?: string): Promise<Project | undefined> {
  const { data } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .eq('team_id', teamId)
    .single();
  if (!data) return undefined;
  const row = data as unknown as EmbeddedRow;
  // Enforce privacy: unshared project only visible to creator.
  if (userId && row.is_shared === false && row.created_by !== userId) return undefined;
  return mapProjectRow(row);
}

export function getProject(id: string, teamId: string, userId?: string): Promise<Project | undefined> {
  return cachedOr(
    () => _getProject(id, teamId, userId),
    ['getProject', id, teamId, userId ?? 'anon'],
    [`project:${id}`, `team:${teamId}`],
  );
}

export async function updateProjectShared(
  projectId: string,
  teamId: string,
  userId: string,
  isShared: boolean,
): Promise<boolean> {
  // Only the creator can flip the privacy toggle.
  const { error } = await supabase
    .from('projects')
    .update({ is_shared: isShared })
    .eq('id', projectId)
    .eq('team_id', teamId)
    .eq('created_by', userId);
  if (!error) tryRevalidate(`project:${projectId}`, `team:${teamId}`);
  return !error;
}

/**
 * Look up the owning team for a project. Used to derive team scope from a project id
 * server-side, instead of trusting any client-supplied teamId.
 */
export async function getProjectTeamId(projectId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('projects')
    .select('team_id')
    .eq('id', projectId)
    .single();
  return (data?.team_id as string | undefined) ?? undefined;
}

/**
 * Fetch a project across a set of teams the caller is authorized for.
 * Use this only when the caller has been independently authorized for ALL teamIds
 * (e.g. MCP server with a session-derived team list).
 */
export async function getProjectForTeams(id: string, teamIds: string[]): Promise<Project | undefined> {
  if (teamIds.length === 0) return undefined;
  const { data } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('id', id)
    .in('team_id', teamIds)
    .single();
  if (!data) return undefined;
  return mapProjectRow(data as unknown as EmbeddedRow);
}

export async function saveProject(project: Project): Promise<void> {
  const { analysis, marketingContent, feedbackAnalyses, campaigns, ...core } = project;

  const basePayload = {
    id: core.id,
    team_id: core.teamId,
    created_by: core.createdBy,
    name: core.name,
    path: core.path ?? null,
    source_type: core.sourceType ?? 'codebase',
    description: core.description ?? null,
    is_github: core.isGithub ?? false,
    github_url: core.githubUrl,
    last_analyzed_commit_sha: core.lastAnalyzedCommitSha,
    social_profiles: core.socialProfiles ?? [],
    analytics_property_id: core.analyticsPropertyId,
    created_at: core.createdAt,
  };

  // Upsert the core project row (with compatibility fallback for legacy schema).
  let { error } = await supabase
    .from('projects')
    .upsert({
      ...basePayload,
      is_shared: core.isShared ?? true,
    });

  if (error && isMissingColumnError(error, 'is_shared')) {
    const fallback = await supabase
      .from('projects')
      .upsert(basePayload);
    error = fallback.error;
  }

  if (error) throw new Error(`Failed to save project: ${error.message}`);

  // Upsert analysis if present
  if (analysis) {
    const { analyzedAt, ...analysisData } = analysis;
    await supabase
      .from('project_analyses')
      .upsert({
        project_id: core.id,
        data: analysisData,
        analyzed_at: analyzedAt,
      });
  }

  // Upsert marketing content if present
  if (marketingContent && marketingContent.length > 0) {
    const rows = marketingContent.map((mc) => ({
      id: mc.id,
      project_id: core.id,
      platform: mc.platform,
      content: mc.content,
      generated_at: mc.generatedAt,
    }));
    await supabase.from('marketing_content').upsert(rows);
  }

  // Upsert feedback if present
  if (feedbackAnalyses && feedbackAnalyses.length > 0) {
    const rows = feedbackAnalyses.map((fa) => ({
      id: fa.id,
      project_id: core.id,
      raw_feedback: fa.rawFeedback,
      sentiment: fa.sentiment,
      sentiment_breakdown: fa.sentimentBreakdown,
      themes: fa.themes,
      feature_requests: fa.featureRequests,
      bugs: fa.bugs,
      praises: fa.praises,
      developer_prompts: fa.developerPrompts,
      analyzed_at: fa.analyzedAt,
      completed_prompts: fa.completedPrompts ?? [],
    }));
    await supabase.from('feedback_analyses').upsert(rows);
  }

  // Upsert campaigns if present
  if (campaigns && campaigns.length > 0) {
    const rows = campaigns.map((c) => ({
      id: c.id,
      project_id: core.id,
      type: c.type,
      goal: c.goal,
      duration: c.duration,
      name: c.name,
      plan: c.plan,
      created_at: c.createdAt,
    }));
    await supabase.from('campaigns').upsert(rows);
  }

  tryRevalidate(`team:${core.teamId}`, `project:${core.id}`);
}

export async function deleteProject(id: string, teamId: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id).eq('team_id', teamId);
  tryRevalidate(`team:${teamId}`, `project:${id}`);
}

export async function saveCampaignToProject(projectId: string, campaign: Campaign, teamId: string): Promise<boolean> {
  const project = await getProject(projectId, teamId);
  if (!project) return false;

  const { error } = await supabase.from('campaigns').insert({
    id: campaign.id,
    project_id: projectId,
    type: campaign.type,
    goal: campaign.goal,
    duration: campaign.duration,
    name: campaign.name,
    plan: campaign.plan,
    created_at: campaign.createdAt,
  });
  if (!error) tryRevalidate(`team:${teamId}`, `project:${projectId}`);
  return !error;
}

export async function saveSocialProfilesToProject(
  projectId: string,
  profiles: { platform: string; url: string }[],
  teamId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({ social_profiles: profiles })
    .eq('id', projectId)
    .eq('team_id', teamId);
  if (!error) tryRevalidate(`project:${projectId}`);
  return !error;
}

export async function updateProjectAnalyticsProperty(
  projectId: string,
  analyticsPropertyId: string | null,
  teamId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({ analytics_property_id: analyticsPropertyId })
    .eq('id', projectId)
    .eq('team_id', teamId);
  if (!error) tryRevalidate(`project:${projectId}`);
  return !error;
}

export async function saveFeedbackToProject(projectId: string, analysis: FeedbackAnalysis, teamId: string): Promise<boolean> {
  const project = await getProject(projectId, teamId);
  if (!project) return false;

  const { error } = await supabase.from('feedback_analyses').insert({
    id: analysis.id,
    project_id: projectId,
    raw_feedback: analysis.rawFeedback,
    sentiment: analysis.sentiment,
    sentiment_breakdown: analysis.sentimentBreakdown,
    themes: analysis.themes,
    feature_requests: analysis.featureRequests,
    bugs: analysis.bugs,
    praises: analysis.praises,
    developer_prompts: analysis.developerPrompts,
    analyzed_at: analysis.analyzedAt,
  });
  if (!error) tryRevalidate(`team:${teamId}`, `project:${projectId}`);
  return !error;
}

export function generateId(): string {
  return crypto.randomUUID();
}
