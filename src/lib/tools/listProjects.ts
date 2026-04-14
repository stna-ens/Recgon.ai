import { z } from 'zod';
import { getAllProjects } from '../storage';
import type { ToolDefinition } from './types';

const parameters = z.object({}).describe('No arguments — lists all projects in the current team.');

type Input = z.infer<typeof parameters>;

interface ProjectSummary {
  id: string;
  name: string;
  stage?: string;
  hasAnalysis: boolean;
  hasAnalytics: boolean;
  feedbackCount: number;
  createdAt: string;
}

export const listProjectsTool: ToolDefinition<Input, { projects: ProjectSummary[] }> = {
  name: 'list_projects',
  description:
    'List all projects in the current team with a short summary (name, stage, whether analysis and GA4 analytics are configured, feedback count). Use this when the user asks what projects they have, or to disambiguate which project they mean before running another tool.',
  parameters,
  summarize: (_input, output) => `${output.projects.length} project(s)`,
  handler: async (_input, ctx) => {
    const projects = await getAllProjects(ctx.teamId);
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        stage: p.analysis?.currentStage,
        hasAnalysis: Boolean(p.analysis),
        hasAnalytics: Boolean(p.analyticsPropertyId),
        feedbackCount: p.feedbackAnalyses?.length ?? 0,
        createdAt: p.createdAt,
      })),
    };
  },
};
