import { z } from 'zod';
import { updateMemberRole } from '../../teamStorage';
import { resolveMember } from '../resolvers';
import { assertTeamWrite } from './assertWrite';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  member: z.string().describe('Member name, email, or userId.'),
  role: z.enum(['owner', 'member', 'viewer']).describe('New role.'),
});

type Input = z.infer<typeof parameters>;
interface Output { userId: string; label: string; role: string; }

export const memberUpdateRoleTool: ToolDefinition<Input, Output> = {
  name: 'member_update_role',
  description: 'Change a team member\'s role (owner / member / viewer). Use for "make Alice an owner", "set Bob to viewer".',
  parameters,
  summarize: (_input, output) => `${output.label} → ${output.role}`,
  handler: async (input, ctx) => {
    await assertTeamWrite(ctx);
    const { member, label } = await resolveMember(input.member, ctx.teamId);
    await updateMemberRole(ctx.teamId, member.userId, input.role);
    return { userId: member.userId, label, role: input.role };
  },
};
