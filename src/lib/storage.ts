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

async function assembleProject(row: Record<string, unknown>): Promise<Project> {
  const projectId = row.id as string;

  // Fetch related data in parallel
  const [analysisRes, marketingRes, feedbackRes, campaignsRes] = await Promise.all([
    supabase.from('project_analyses').select('data, analyzed_at').eq('project_id', projectId).single(),
    supabase.from('marketing_content').select('*').eq('project_id', projectId).order('generated_at', { ascending: false }),
    supabase.from('feedback_analyses').select('*').eq('project_id', projectId).order('analyzed_at', { ascending: false }),
    supabase.from('campaigns').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);

  const analysis = analysisRes.data
    ? { ...analysisRes.data.data as ProductAnalysis, analyzedAt: analysisRes.data.analyzed_at }
    : undefined;

  const marketingContent: MarketingContent[] = (marketingRes.data ?? []).map((r) => ({
    id: r.id,
    platform: r.platform,
    content: r.content as Record<string, string>,
    generatedAt: r.generated_at,
  }));

  const feedbackAnalyses: FeedbackAnalysis[] = (feedbackRes.data ?? []).map((r) => ({
    id: r.id,
    rawFeedback: r.raw_feedback as string[],
    sentiment: r.sentiment,
    sentimentBreakdown: r.sentiment_breakdown as FeedbackAnalysis['sentimentBreakdown'],
    themes: r.themes as string[],
    featureRequests: r.feature_requests as string[],
    bugs: r.bugs as string[],
    praises: r.praises as string[],
    developerPrompts: r.developer_prompts as string[],
    analyzedAt: r.analyzed_at,
    completedPrompts: (r.completed_prompts as FeedbackAnalysis['completedPrompts']) ?? [],
  }));

  const campaigns: Campaign[] = (campaignsRes.data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    goal: r.goal,
    duration: r.duration,
    name: r.name,
    plan: r.plan as Record<string, unknown>,
    createdAt: r.created_at,
  }));

  return {
    id: projectId,
    teamId: row.team_id as string,
    createdBy: row.created_by as string,
    name: row.name as string,
    path: row.path as string | undefined,
    sourceType: (row.source_type as string ?? 'codebase') as Project['sourceType'],
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
export async function getAllProjects(teamId: string, userId?: string): Promise<Project[]> {
  let data: Record<string, unknown>[] | null;
  let error: { message: string } | null;

  if (userId) {
    const result = await supabase
      .from('projects')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .or(`is_shared.eq.true,created_by.eq.${userId}`);
    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .from('projects')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    data = result.data;
    error = result.error;
  }

  // Backward-compatibility for databases that haven't added projects.is_shared yet.
  if (error && isMissingColumnError(error, 'is_shared')) {
    const fallback = await supabase
      .from('projects')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(`Failed to list projects: ${error.message}`);

  if (!data || data.length === 0) return [];
  return Promise.all(data.map((row) => assembleProject(row)));
}

export async function getProject(id: string, teamId: string, userId?: string): Promise<Project | undefined> {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('team_id', teamId)
    .single();
  if (!data) return undefined;
  // Enforce privacy: unshared project only visible to creator.
  if (userId && data.is_shared === false && data.created_by !== userId) return undefined;
  return assembleProject(data);
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
    .select('*')
    .eq('id', id)
    .in('team_id', teamIds)
    .single();
  if (!data) return undefined;
  return assembleProject(data);
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
}

export async function deleteProject(id: string, teamId: string): Promise<void> {
  await supabase.from('projects').delete().eq('id', id).eq('team_id', teamId);
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
  return !error;
}

export function generateId(): string {
  return crypto.randomUUID();
}
