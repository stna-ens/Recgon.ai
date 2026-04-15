import { z } from 'zod';
import { getAnalyticsConfig } from '../analyticsStorage';
import { fetchAnalyticsData } from '../analyticsEngine';
import { chat } from '../gemini';
import { ANALYTICS_SYSTEM, analyticsUserPrompt } from '../prompts';
import { AnalyticsInsightsSchema, parseAIResponse } from '../schemas';
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
    const project = await resolveProject(input.project, ctx.teamId);

    if (!project.analyticsPropertyId) {
      throw new Error(
        `${project.name} doesn't have a GA4 property configured. Connect one in Analytics → Settings.`,
      );
    }

    const analyticsConfig = await getAnalyticsConfig(ctx.userId);
    if (!analyticsConfig) {
      throw new Error(
        'No GA4 credentials found. Connect your Google account or upload a service account key in the Analytics tab.',
      );
    }

    const authOptions =
      analyticsConfig.authMethod === 'oauth' && analyticsConfig.oauth
        ? { oauth: analyticsConfig.oauth, userId: ctx.userId }
        : analyticsConfig.serviceAccountJson
        ? { serviceAccountJson: analyticsConfig.serviceAccountJson }
        : null;

    if (!authOptions) {
      throw new Error('GA4 auth method is not configured. Re-connect in the Analytics tab.');
    }

    const data = await fetchAnalyticsData(project.analyticsPropertyId, authOptions, input.days);

    // Run AI insights on the raw data
    const raw = await chat(ANALYTICS_SYSTEM, analyticsUserPrompt(data, input.days), {
      temperature: 0.5,
      maxTokens: 4096,
    });
    const insights = parseAIResponse(raw, AnalyticsInsightsSchema);

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
