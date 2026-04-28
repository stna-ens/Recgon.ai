import { z } from 'zod';
import { getAnalyticsConfig } from '../analyticsStorage';
import { fetchAnalyticsData } from '../analyticsEngine';
import { ANALYTICS_SYSTEM, analyticsUserPrompt } from '../prompts';
import { AnalyticsInsightsSchema } from '../schemas';
import { generateStructuredOutput } from '../llm/quality';
import { saveAnalyticsInsight } from '../analyticsInsightsStorage';
import { logger } from '../logger';
import { resolveProject } from './resolveProject';
import type { ToolDefinition } from './types';

const parameters = z.object({
  project: z.string().describe('Project name or UUID to fetch GA4 analytics for.'),
  days: z.number().int().min(1).max(365).default(30).describe('Number of days to look back. Default 30.'),
});

type Input = z.infer<typeof parameters>;

interface AnalyticsOutput {
  projectName: string;
  propertyId: string;
  dateRange: string;
  overview: Record<string, number>;
  topInsights: string[];
  recommendations: string[];
}

export const fetchAnalyticsTool: ToolDefinition<Input, AnalyticsOutput> = {
  name: 'fetch_analytics',
  description:
    'Fetch live GA4 analytics data for a project and return AI-generated insights. Requires the project to have a GA4 property configured. Call this when the user asks about traffic, sessions, user counts, drop-offs, or wants a GA4 report.',
  parameters,
  summarize: (_input, output) =>
    `${output.projectName}: ${output.overview.sessions ?? '?'} sessions over ${output.dateRange}`,
  handler: async (input, ctx) => {
    const project = await resolveProject(input.project, ctx.teamId, ctx.userId);

    if (!project.analyticsPropertyId) {
      throw new Error(
        `${project.name} doesn't have a GA4 property configured. Connect one in Analytics → Settings.`,
      );
    }

    const scope = { kind: 'team' as const, teamId: ctx.teamId };
    const analyticsConfig = await getAnalyticsConfig(scope);
    if (!analyticsConfig) {
      throw new Error(
        'No GA4 credentials found for this team. A team owner can connect Google Analytics in the Analytics tab.',
      );
    }

    const authOptions =
      analyticsConfig.authMethod === 'oauth' && analyticsConfig.oauth
        ? { oauth: analyticsConfig.oauth, scope }
        : analyticsConfig.serviceAccountJson
        ? { serviceAccountJson: analyticsConfig.serviceAccountJson }
        : null;

    if (!authOptions) {
      throw new Error('GA4 auth method is not configured. Re-connect in the Analytics tab.');
    }

    const data = await fetchAnalyticsData(project.analyticsPropertyId, authOptions, input.days);

    // Run AI insights on the raw data
    const insights = await generateStructuredOutput({
      taskKind: 'analytics_insights',
      schema: AnalyticsInsightsSchema,
      systemPrompt: ANALYTICS_SYSTEM,
      userPrompt: analyticsUserPrompt(data, input.days),
      options: { temperature: 0.5, maxTokens: 4096 },
      qualityProfile: 'analytics',
    });

    try {
      await saveAnalyticsInsight({
        projectId: project.id,
        teamId: ctx.teamId,
        userId: ctx.userId,
        propertyId: data.propertyId,
        days: input.days,
        dateRange: data.dateRange,
        overview: data.overview as unknown as Record<string, unknown>,
        insights,
        rawData: data,
        source: ctx.source,
      });
    } catch (err) {
      logger.warn('failed to persist analytics insights from tool', {
        projectId: project.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      projectName: project.name,
      propertyId: data.propertyId,
      dateRange: data.dateRange,
      overview: {
        sessions: data.overview.sessions,
        activeUsers: data.overview.activeUsers,
        newUsers: data.overview.newUsers,
        bounceRate: Math.round(data.overview.bounceRate),
        avgSessionDuration: Math.round(data.overview.averageSessionDuration),
      },
      topInsights: (insights as { keyInsights?: string[] }).keyInsights?.slice(0, 5) ?? [],
      recommendations: (insights as { recommendations?: string[] }).recommendations?.slice(0, 3) ?? [],
      rawData: data,
    } as AnalyticsOutput;
  },
};
