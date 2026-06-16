import { verifyTeamWriteAccess } from '../../teamStorage';
import type { ToolContext } from '../types';

/** Guard for team-mutating tools: throws unless the user can write to the team. */
export async function assertTeamWrite(ctx: ToolContext): Promise<void> {
  const ok = await verifyTeamWriteAccess(ctx.teamId, ctx.userId);
  if (!ok) throw new Error('You do not have permission to change this team (viewers are read-only).');
}
