import { z } from 'zod';
import { getTeamMembers } from '../../teamStorage';
import type { ToolDefinition, ToolDisplay } from '../types';

const parameters = z.object({}).describe('No arguments — lists members of the current team.');
type Input = z.infer<typeof parameters>;
interface Output { count: number; members: Array<{ userId: string; label: string; role: string }>; }

export const memberListTool: ToolDefinition<Input, Output> = {
  name: 'member_list',
  description: 'List the members of the current team with their roles. Use for "who is on this team".',
  parameters,
  summarize: (_input, output) => `${output.count} member(s)`,
  display: (_input, output): ToolDisplay => ({
    kind: 'members',
    items: output.members.map((m) => ({ id: m.userId, title: m.label, badges: [m.role] })),
  }),
  handler: async (_input, ctx) => {
    const members = await getTeamMembers(ctx.teamId);
    return {
      count: members.length,
      members: members.map((m) => ({
        userId: m.userId,
        label: m.nickname || m.email || m.userId,
        role: m.role,
      })),
    };
  },
};
