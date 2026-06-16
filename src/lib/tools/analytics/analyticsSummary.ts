import { z } from 'zod';
import { getAllProjects } from '../../storage';
import type { ToolDefinition, ToolDisplay } from '../types';

const parameters = z.object({}).describe('No arguments — shows which projects have GA4 analytics connected.');
type Input = z.infer<typeof parameters>;
interface Output { connected: number; total: number; projects: Array<{ id: string; name: string; propertyId: string | null }>; }

export const analyticsSummaryTool: ToolDefinition<Input, Output> = {
  name: 'analytics_summary',
  description:
    'Show which projects have Google Analytics (GA4) connected and their property IDs. Use for "what\'s connected to analytics", "which projects have GA4". For live metrics use fetch_analytics.',
  parameters,
  summarize: (_input, output) => `${output.connected}/${output.total} project(s) connected`,
  display: (_input, output): ToolDisplay => ({
    kind: 'projects',
    items: output.projects.map((p) => ({
      id: p.id,
      title: p.name,
      badges: [p.propertyId ? `GA4 ${p.propertyId}` : 'not connected'],
      href: `/projects/${p.id}`,
    })),
  }),
  handler: async (_input, ctx) => {
    const projects = await getAllProjects(ctx.teamId, ctx.userId);
    const rows = projects.map((p) => ({ id: p.id, name: p.name, propertyId: p.analyticsPropertyId ?? null }));
    return {
      connected: rows.filter((r) => r.propertyId).length,
      total: rows.length,
      projects: rows,
    };
  },
};
