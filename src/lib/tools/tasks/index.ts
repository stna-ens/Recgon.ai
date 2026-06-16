import type { ToolDefinition } from '../types';
import { taskListTool } from './taskList';
import { taskGetTool } from './taskGet';
import { taskCreateTool } from './taskCreate';
import { taskAssignTool } from './taskAssign';
import { taskReassignTool } from './taskReassign';
import { taskSetStatusTool } from './taskSetStatus';
import { taskScheduleTool } from './taskSchedule';
import { taskSnoozeTool } from './taskSnooze';
import { taskUpdateDetailsTool } from './taskUpdateDetails';
import { taskProofTool } from './taskProof';
import { taskRateTool } from './taskRate';
import { taskCommentTool } from './taskComment';
import { taskTriageTool } from './taskTriage';

export const taskTools: ToolDefinition[] = [
  taskListTool as unknown as ToolDefinition,
  taskGetTool as unknown as ToolDefinition,
  taskCreateTool as unknown as ToolDefinition,
  taskAssignTool as unknown as ToolDefinition,
  taskReassignTool as unknown as ToolDefinition,
  taskSetStatusTool as unknown as ToolDefinition,
  taskScheduleTool as unknown as ToolDefinition,
  taskSnoozeTool as unknown as ToolDefinition,
  taskUpdateDetailsTool as unknown as ToolDefinition,
  taskProofTool as unknown as ToolDefinition,
  taskRateTool as unknown as ToolDefinition,
  taskCommentTool as unknown as ToolDefinition,
  taskTriageTool as unknown as ToolDefinition,
];
