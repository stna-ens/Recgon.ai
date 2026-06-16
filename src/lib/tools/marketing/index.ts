import type { ToolDefinition } from '../types';
import { generateContentTool } from '../generateContent';
import { generateCampaignTool } from '../generateCampaign';

export const marketingTools: ToolDefinition[] = [
  generateContentTool as unknown as ToolDefinition,
  generateCampaignTool as unknown as ToolDefinition,
];
