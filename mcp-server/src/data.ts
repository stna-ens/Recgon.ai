import { createClient } from '@supabase/supabase-js';
import type { Project, ProductAnalysis, MarketingContent, FeedbackAnalysis, Campaign } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function assembleProject(row: Record<string, unknown>): Promise<Project> {
  const projectId = row.id as string;

  const [analysisRes, marketingRes, feedbackRes, campaignsRes] = await Promise.all([
    supabase.from('project_analyses').select('data, analyzed_at').eq('project_id', projectId).single(),
    supabase.from('marketing_content').select('*').eq('project_id', projectId).order('generated_at', { ascending: false }),
    supabase.from('feedback_analyses').select('*').eq('project_id', projectId).order('analyzed_at', { ascending: false }),
    supabase.from('campaigns').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);

  const analysis = analysisRes.data
    ? { ...(analysisRes.data.data as ProductAnalysis), analyzedAt: analysisRes.data.analyzed_at as string }
    : undefined;

  const marketingContent: MarketingContent[] = (marketingRes.data ?? []).map((r) => ({
    id: r.id as string,
    platform: r.platform as string,
    content: r.content as Record<string, string>,
    generatedAt: r.generated_at as string,
  }));

  const feedbackAnalyses: FeedbackAnalysis[] = (feedbackRes.data ?? []).map((r) => ({
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
    completedPrompts: (r as Record<string, unknown>).completed_prompts as FeedbackAnalysis['completedPrompts'],
  }));

  const campaigns: Campaign[] = (campaignsRes.data ?? []).map((r) => ({
    id: r.id as string,
    type: r.type as string,
    goal: r.goal as string,
    duration: r.duration as string,
    name: r.name as string,
    plan: r.plan as Record<string, unknown>,
    createdAt: r.created_at as string,
  }));

  return {
    id: projectId,
    teamId: row.team_id as string,
    createdBy: row.created_by as string,
    name: row.name as string,
    path: row.path as string,
    isGithub: row.is_github as boolean | undefined,
    githubUrl: row.github_url as string | undefined,
    lastAnalyzedCommitSha: row.last_analyzed_commit_sha as string | undefined,
    createdAt: row.created_at as string,
    analysis,
    marketingContent: marketingContent.length > 0 ? marketingContent : undefined,
    feedbackAnalyses: feedbackAnalyses.length > 0 ? feedbackAnalyses : undefined,
    campaigns: campaigns.length > 0 ? campaigns : undefined,
  };
}

export async function getAllProjects(): Promise<Project[]> {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) return [];
  return Promise.all(data.map((row) => assembleProject(row)));
}

export async function getProject(id: string): Promise<Project | undefined> {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!data) return undefined;
  return assembleProject(data);
}

export async function updateProject(updated: Project): Promise<void> {
  const { analysis, marketingContent, feedbackAnalyses, campaigns, ...core } = updated;

  await supabase.from('projects').update({
    team_id: core.teamId,
    created_by: core.createdBy,
    name: core.name,
    path: core.path,
    is_github: core.isGithub ?? false,
    github_url: core.githubUrl,
    last_analyzed_commit_sha: core.lastAnalyzedCommitSha,
    created_at: core.createdAt,
  }).eq('id', core.id);

  if (analysis) {
    const { analyzedAt, ...analysisData } = analysis;
    await supabase.from('project_analyses').upsert({
      project_id: core.id,
      data: analysisData,
      analyzed_at: analyzedAt,
    });
  }

  if (feedbackAnalyses) {
    for (const fa of feedbackAnalyses) {
      await supabase.from('feedback_analyses').upsert({
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
      });
    }
  }
}
