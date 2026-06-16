import { z } from 'zod';
import { removeTeamMember } from '../../teamStorage';
import { resolveMember } from '../resolvers';
import { assertTeamWrite } from './assertWrite';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  member: z.string().describe('Member name, email, or userId.'),
  confirm: z.boolean().optional().describe('Must be true to remove. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;
interface Output { userId: string; label: string; removed: true; }

export const memberRemoveTool: ToolDefinition<Input, Output> = {
  name: 'member_remove',
  description: 'Remove a member from the current team. Destructive — confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async (input, ctx) => {
    const { label } = await resolveMember(input.member, ctx.teamId);
    return `remove ${label} from this team`;
  },
  summarize: (_input, output) => `Removed ${output.label}`,
  handler: async (input, ctx) => {
    await assertTeamWrite(ctx);
    const { member, label } = await resolveMember(input.member, ctx.teamId);
    if (member.userId === ctx.userId) throw new Error('You cannot remove yourself.');
    await removeTeamMember(ctx.teamId, member.userId);
    return { userId: member.userId, label, removed: true };
  },
};
