import { z } from 'zod';
import { getTeamInvitations } from '../../teamStorage';
import type { ToolDefinition, ToolDisplay } from '../types';

const parameters = z.object({}).describe('No arguments — lists pending invitations for the current team.');
type Input = z.infer<typeof parameters>;
interface Output { count: number; invites: Array<{ id: string; email: string | null; role: string; expiresAt: string }>; }

export const inviteListTool: ToolDefinition<Input, Output> = {
  name: 'invite_list',
  description: 'List pending invitations for the current team. Use for "show pending invites".',
  parameters,
  summarize: (_input, output) => `${output.count} pending invite(s)`,
  display: (_input, output): ToolDisplay => ({
    kind: 'invites',
    items: output.invites.map((i) => ({
      id: i.id,
      title: i.email ?? 'Shareable link',
      badges: [i.role, `expires ${i.expiresAt.slice(0, 10)}`],
    })),
  }),
  handler: async (_input, ctx) => {
    const invites = (await getTeamInvitations(ctx.teamId)).filter((i) => !i.acceptedAt);
    return {
      count: invites.length,
      invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    };
  },
};
