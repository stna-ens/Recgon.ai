import { z } from 'zod';
import { getTeamInvitations, revokeInvitation } from '../../teamStorage';
import { assertTeamWrite } from './assertWrite';
import type { ToolDefinition } from '../types';

const parameters = z.object({
  invite: z.string().describe('Invitation email, token, or id to revoke.'),
  confirm: z.boolean().optional().describe('Must be true to revoke. Omit on the first call so the user is asked to confirm.'),
});

type Input = z.infer<typeof parameters>;
interface Output { id: string; label: string; revoked: true; }

async function findInvite(ref: string, teamId: string) {
  const invites = (await getTeamInvitations(teamId)).filter((i) => !i.acceptedAt);
  const needle = ref.trim().toLowerCase();
  const match = invites.find(
    (i) => i.id === ref || i.token === ref || (i.email ?? '').toLowerCase() === needle,
  );
  if (!match) throw new Error(`No pending invite matching "${ref}".`);
  return match;
}

export const inviteRevokeTool: ToolDefinition<Input, Output> = {
  name: 'invite_revoke',
  description: 'Revoke a pending team invitation. Destructive — confirm first.',
  parameters,
  destructive: true,
  confirmPrompt: async (input, ctx) => {
    const invite = await findInvite(input.invite, ctx.teamId);
    return `revoke the invite for ${invite.email ?? 'the shareable link'}`;
  },
  summarize: (_input, output) => `Revoked invite ${output.label}`,
  handler: async (input, ctx) => {
    await assertTeamWrite(ctx);
    const invite = await findInvite(input.invite, ctx.teamId);
    await revokeInvitation(invite.id, ctx.teamId, ctx.userId);
    return { id: invite.id, label: invite.email ?? 'link', revoked: true };
  },
};
