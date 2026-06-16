import type { ToolDefinition } from '../types';
import { teamListTool } from './teamList';
import { teamGetTool } from './teamGet';
import { teamCreateTool } from './teamCreate';
import { teamDeleteTool } from './teamDelete';
import { memberListTool } from './memberList';
import { memberRemoveTool } from './memberRemove';
import { memberUpdateRoleTool } from './memberUpdateRole';
import { inviteCreateTool } from './inviteCreate';
import { inviteListTool } from './inviteList';
import { inviteRevokeTool } from './inviteRevoke';

export const teamTools: ToolDefinition[] = [
  teamListTool as unknown as ToolDefinition,
  teamGetTool as unknown as ToolDefinition,
  teamCreateTool as unknown as ToolDefinition,
  teamDeleteTool as unknown as ToolDefinition,
  memberListTool as unknown as ToolDefinition,
  memberRemoveTool as unknown as ToolDefinition,
  memberUpdateRoleTool as unknown as ToolDefinition,
  inviteCreateTool as unknown as ToolDefinition,
  inviteListTool as unknown as ToolDefinition,
  inviteRevokeTool as unknown as ToolDefinition,
];
