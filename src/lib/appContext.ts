import type { Project } from './storage';

const DEFAULT_LIMIT = 7000;

function clip(value: string | undefined | null, max = 500): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function list(items: (string | undefined | null)[] | undefined, maxItems = 5, maxChars = 180): string[] {
  return (items ?? [])
    .filter((item): item is string => Boolean(item && item.trim()))
    .slice(0, maxItems)
    .map((item) => clip(item, maxChars));
}

function compactJson(value: unknown, max = 700): string {
  if (!value) return '';
  return clip(JSON.stringify(value), max);
}

export function buildProjectAppContext(project: Project, limit = DEFAULT_LIMIT): string {
  const analysis = project.analysis;
  const feedback = project.feedbackAnalyses ?? [];
  const marketing = project.marketingContent ?? [];
  const campaigns = project.campaigns ?? [];

  const sections: string[] = [
    'RECENT APP CONTEXT:',
    `Project: ${project.name}`,
    project.description ? `Project description: ${clip(project.description, 700)}` : '',
    `Source: ${project.sourceType ?? (project.isGithub ? 'github' : 'unknown')}${project.githubUrl ? ` (${project.githubUrl})` : ''}`,
    project.analyticsPropertyId ? `Analytics: GA4 connected (${project.analyticsPropertyId})` : 'Analytics: not connected or no property saved',
    project.socialProfiles?.length
      ? `Feedback/source profiles: ${project.socialProfiles.map((p) => `${p.platform}: ${p.url}`).join('; ')}`
      : 'Feedback/source profiles: none configured',
  ].filter(Boolean);

  if (analysis) {
    sections.push(
      '',
      'Latest product analysis:',
      `- Product description: ${clip(analysis.description, 700)}`,
      `- Stage: ${analysis.currentStage}`,
      `- Target audience: ${clip(analysis.targetAudience, 350)}`,
      `- Problem: ${clip(analysis.problemStatement, 450)}`,
      `- Features: ${list(analysis.features, 7).join('; ') || 'none saved'}`,
      `- Unique points: ${list(analysis.uniqueSellingPoints, 5).join('; ') || 'none saved'}`,
      `- Top risks: ${list(analysis.topRisks, 5).join('; ') || 'none saved'}`,
      `- Next steps: ${list(analysis.prioritizedNextSteps, 7, 220).join('; ') || 'none saved'}`,
      `- GTM: ${clip(analysis.gtmStrategy, 600) || 'none saved'}`,
    );
  } else {
    sections.push('', 'Latest product analysis: none yet');
  }

  if (feedback.length > 0) {
    const recent = feedback.slice(0, 3).map((run, index) => [
      `Run ${index + 1} (${run.analyzedAt}, ${run.sentiment}):`,
      `summary=${clip(run.summary, 450) || 'none'}`,
      `themes=${list(run.themes, 5).join('; ') || 'none'}`,
      `featureRequests=${list(run.featureRequests, 4).join('; ') || 'none'}`,
      `bugs=${list(run.bugs, 4).join('; ') || 'none'}`,
      `developerPrompts=${list(run.developerPrompts, 4, 220).join('; ') || 'none'}`,
    ].join(' '));
    sections.push('', `Recent feedback analyses (${feedback.length} total):`, ...recent);
  } else {
    sections.push('', 'Recent feedback analyses: none yet');
  }

  if (marketing.length > 0) {
    sections.push(
      '',
      `Recent marketing content (${marketing.length} total):`,
      ...marketing.slice(0, 4).map((item) =>
        `- ${item.platform} at ${item.generatedAt}: ${compactJson(item.content, 650)}`
      ),
    );
  }

  if (campaigns.length > 0) {
    sections.push(
      '',
      `Recent campaigns (${campaigns.length} total):`,
      ...campaigns.slice(0, 3).map((campaign) =>
        `- ${campaign.name} (${campaign.type}, ${campaign.duration}, goal: ${clip(campaign.goal, 180)}): ${compactJson(campaign.plan, 650)}`
      ),
    );
  }

  const context = sections.join('\n');
  return context.length > limit ? `${context.slice(0, limit - 1)}...` : context;
}
