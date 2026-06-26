import type { ToolDefinition } from '../types';
import { issueCreateTool } from './issueCreate';
import { issueListTool } from './issueList';
import { issueGetTool } from './issueGet';

export const issueTools: ToolDefinition[] = [
  issueCreateTool as unknown as ToolDefinition,
  issueListTool as unknown as ToolDefinition,
  issueGetTool as unknown as ToolDefinition,
];
