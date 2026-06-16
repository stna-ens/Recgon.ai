import type { ToolDefinition } from '../types';
import { teammateListTool } from './teammateList';
import { teammateGetTool } from './teammateGet';
import { teammateCreateTool } from './teammateCreate';
import { teammateUpdateTool } from './teammateUpdate';
import { teammateRetireTool } from './teammateRetire';

export const teammateTools: ToolDefinition[] = [
  teammateListTool as unknown as ToolDefinition,
  teammateGetTool as unknown as ToolDefinition,
  teammateCreateTool as unknown as ToolDefinition,
  teammateUpdateTool as unknown as ToolDefinition,
  teammateRetireTool as unknown as ToolDefinition,
];
