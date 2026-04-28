import { NextResponse } from 'next/server';
import { verifyTeamAccess } from './teamStorage';
import type { ConfigScope } from './analyticsStorage';

export type ScopeResolution =
  | { ok: true; scope: ConfigScope; role: 'owner' | 'member' | 'viewer' | 'personal' }
  | { ok: false; response: NextResponse };

export async function resolveScope(
  params: URLSearchParams,
  userId: string,
  opts: { requireOwnerForTeam?: boolean } = {},
): Promise<ScopeResolution> {
  const scopeParam = params.get('scope') === 'team' ? 'team' : 'personal';

  if (scopeParam === 'personal') {
    return { ok: true, scope: { kind: 'personal', userId }, role: 'personal' };
  }

  const teamId = params.get('teamId');
  if (!teamId) {
    return { ok: false, response: NextResponse.json({ error: 'teamId is required for team scope' }, { status: 400 }) };
  }

  const role = await verifyTeamAccess(teamId, userId);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (opts.requireOwnerForTeam && role !== 'owner') {
    return { ok: false, response: NextResponse.json({ error: 'Only team owners can manage team analytics' }, { status: 403 }) };
  }

  return { ok: true, scope: { kind: 'team', teamId }, role: role as 'owner' | 'member' | 'viewer' };
}
