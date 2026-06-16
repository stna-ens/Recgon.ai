import type { ToolDefinition } from '../types';
import { accountGetTool } from './accountGet';
import { accountUpdateTool } from './accountUpdate';
import { accountQuotaTool } from './accountQuota';
import { calendarListTool } from './calendarList';
import { inboxListTool } from './inboxList';

export const accountTools: ToolDefinition[] = [
  accountGetTool as unknown as ToolDefinition,
  accountUpdateTool as unknown as ToolDefinition,
  accountQuotaTool as unknown as ToolDefinition,
  calendarListTool as unknown as ToolDefinition,
  inboxListTool as unknown as ToolDefinition,
];
