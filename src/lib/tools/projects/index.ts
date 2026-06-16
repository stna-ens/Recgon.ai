import type { ToolDefinition } from '../types';
import { listProjectsTool } from '../listProjects';
import { getProjectDetailsTool } from '../getProjectDetails';
import { analyzeCodeTool } from '../analyzeCode';
import { projectUpdateTool } from './projectUpdate';
import { projectDeleteTool } from './projectDelete';
import { projectSetAnalyticsPropertyTool } from './projectSetAnalyticsProperty';

export const projectTools: ToolDefinition[] = [
  listProjectsTool as unknown as ToolDefinition,
  getProjectDetailsTool as unknown as ToolDefinition,
  analyzeCodeTool as unknown as ToolDefinition,
  projectUpdateTool as unknown as ToolDefinition,
  projectDeleteTool as unknown as ToolDefinition,
  projectSetAnalyticsPropertyTool as unknown as ToolDefinition,
];
