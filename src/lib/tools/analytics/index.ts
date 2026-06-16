import type { ToolDefinition } from '../types';
import { fetchAnalyticsTool } from '../fetchAnalytics';
import { analyticsSummaryTool } from './analyticsSummary';

export const analyticsTools: ToolDefinition[] = [
  fetchAnalyticsTool as unknown as ToolDefinition,
  analyticsSummaryTool as unknown as ToolDefinition,
];
