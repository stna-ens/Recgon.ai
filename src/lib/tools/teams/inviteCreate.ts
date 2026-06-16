import { z } from 'zod';
import { createInvitation } from '../../teamStorage';
import { assertTeamWrite } from './assertWrite';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  role: z.enum(['member', 'viewer']).optional().describe('Role the invitee will get. Default "member".'),
  email: z.string().optional().describe('Optional email to address the invite to (otherwise it is a shareable link).'),
});

type Input = z.infer<typeof parameters>;
interface Output { token: string; role: string; inviteUrl: string; }

export const inviteCreateTool: ToolDefinition<Input, Output> = {
  name: 'invite_create',
  description: 'Create an invitation link to add someone to the current team. Use for "invite someone", "create an invite link".',
  parameters,
  summarize: (_input, output) => `Invite created (${output.role})`,
  handler: async (input, ctx) => {
    await assertTeamWrite(ctx);
    const invite = await createInvitation(ctx.teamId, input.role ?? 'member', ctx.userId, input.email);
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
    return {
      token: invite.token,
      role: invite.role,
      inviteUrl: `${base}/teams/invite/${invite.token}`,
    };
  },
};
