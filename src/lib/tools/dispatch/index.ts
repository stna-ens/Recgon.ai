import type { ToolDefinition } from '../types';
import { dispatchRunTool } from './dispatchRun';
import { dispatchTaskTool } from './dispatchTask';

export const dispatchTools: ToolDefinition[] = [
  dispatchRunTool as unknown as ToolDefinition,
  dispatchTaskTool as unknown as ToolDefinition,
];
