import { supabase } from './supabase';
import crypto from 'crypto';

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarColor?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: 'owner' | 'member' | 'viewer';
  joinedAt: string;
  nickname?: string;
  email?: string;
  avatarUrl?: string;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: string;
  invitedBy: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'team';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  const { count } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('slug', slug);
  if (count && count > 0) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  return slug;
}

export async function createTeam(name: string, userId: string): Promise<Team> {
  const id = generateId();
  const slug = await uniqueSlug(name);

  const { data, error } = await supabase
    .from('teams')
    .insert({ id, name, slug, created_by: userId })
    .select('*')
    .single();

  if (error || !data) throw new Error(`Failed to create team: ${error?.message}`);

  // Add creator as owner
  await supabase.from('team_members').insert({
    team_id: id,
    user_id: userId,
    role: 'owner',
  });

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export async function getTeam(teamId: string): Promise<Team | undefined> {
  const { data } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (!data) return undefined;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description ?? undefined,
    avatarColor: data.avatar_color ?? undefined,
    avatarUrl: data.avatar_url ?? undefined,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export async function getUserTeams(userId: string): Promise<(Team & { role: string })[]> {
  const { data } = await supabase
    .from('team_members')
    .select('role, teams(*)')
    .eq('user_id', userId);

  if (!data) return [];
  return data
    .filter((d) => d.teams)
    .map((d) => {
      const t = d.teams as unknown as Record<string, unknown>;
      return {
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
        description: (t.description as string | undefined) ?? undefined,
        avatarColor: (t.avatar_color as string | undefined) ?? undefined,
        avatarUrl: (t.avatar_url as string | undefined) ?? undefined,
        createdBy: t.created_by as string,
        createdAt: t.created_at as string,
        role: d.role,
      };
    });
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data } = await supabase
    .from('team_members')
    .select('*, users(nickname, email, avatar_url)')
    .eq('team_id', teamId);

  if (!data) return [];
  return data.map((d) => {
    const user = d.users as Record<string, unknown> | null;
    return {
      teamId: d.team_id,
      userId: d.user_id,
      role: d.role,
      joinedAt: d.joined_at,
      nickname: user?.nickname as string | undefined,
      email: user?.email as string | undefined,
      avatarUrl: user?.avatar_url as string | undefined,
    };
  });
}

export async function addTeamMember(teamId: string, userId: string, role: 'owner' | 'member' | 'viewer'): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: userId, role });
  if (error) throw new Error(`Failed to add member: ${error.message}`);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  // Prevent removing the last owner
  const members = await getTeamMembers(teamId);
  const owners = members.filter((m) => m.role === 'owner');
  if (owners.length === 1 && owners[0].userId === userId) {
    throw new Error('Cannot remove the last owner of a team');
  }

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to remove member: ${error.message}`);
}

export async function updateMemberRole(teamId: string, userId: string, role: 'owner' | 'member' | 'viewer'): Promise<void> {
  // Prevent demoting the last owner
  if (role !== 'owner') {
    const members = await getTeamMembers(teamId);
    const owners = members.filter((m) => m.role === 'owner');
    if (owners.length === 1 && owners[0].userId === userId) {
      throw new Error('Cannot demote the last owner of a team');
    }
  }

  const { error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to update role: ${error.message}`);
}

export async function createInvitation(
  teamId: string,
  email: string,
  role: 'member' | 'viewer',
  invitedBy: string
): Promise<TeamInvitation> {
  const id = generateId();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const { data, error } = await supabase
    .from('team_invitations')
    .insert({
      id,
      team_id: teamId,
      email,
      role,
      invited_by: invitedBy,
      token,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(`Failed to create invitation: ${error?.message}`);
  return {
    id: data.id,
    teamId: data.team_id,
    email: data.email,
    role: data.role,
    invitedBy: data.invited_by,
    token: data.token,
    expiresAt: data.expires_at,
    acceptedAt: data.accepted_at,
    createdAt: data.created_at,
  };
}

export async function getInvitation(token: string): Promise<(TeamInvitation & { teamName: string }) | undefined> {
  const { data } = await supabase
    .from('team_invitations')
    .select('*, teams(name)')
    .eq('token', token)
    .is('accepted_at', null)
    .single();

  if (!data) return undefined;
  const team = data.teams as Record<string, unknown> | null;
  return {
    id: data.id,
    teamId: data.team_id,
    email: data.email,
    role: data.role,
    invitedBy: data.invited_by,
    token: data.token,
    expiresAt: data.expires_at,
    acceptedAt: data.accepted_at,
    createdAt: data.created_at,
    teamName: (team?.name as string) ?? '',
  };
}

export async function acceptInvitation(token: string, userId: string): Promise<void> {
  const invitation = await getInvitation(token);
  if (!invitation) throw new Error('Invalid or expired invitation');
  if (new Date(invitation.expiresAt) < new Date()) throw new Error('Invitation has expired');

  // Add user to team
  await addTeamMember(invitation.teamId, userId, invitation.role as 'member' | 'viewer');

  // Mark invitation as accepted
  await supabase
    .from('team_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token);
}

export async function updateTeamInfo(
  teamId: string,
  fields: { name?: string; description?: string; avatarColor?: string | null },
  userId: string
): Promise<void> {
  const role = await verifyTeamAccess(teamId, userId);
  if (role !== 'owner') throw new Error('Only team owners can update team info');

  const update: Record<string, string | null> = {};

  if (fields.name !== undefined) {
    const trimmed = fields.name.trim();
    if (trimmed.length < 2) throw new Error('Team name must be at least 2 characters');
    update.name = trimmed;
  }
  if (fields.description !== undefined) {
    update.description = fields.description.trim() || null;
  }
  if (fields.avatarColor !== undefined) {
    update.avatar_color = fields.avatarColor;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase.from('teams').update(update).eq('id', teamId);
  if (error) throw new Error(`Failed to update team: ${error.message}`);
}

/** @deprecated use updateTeamInfo */
export async function updateTeamName(teamId: string, name: string, userId: string): Promise<void> {
  return updateTeamInfo(teamId, { name }, userId);
}

export async function getTeamInvitations(teamId: string): Promise<TeamInvitation[]> {
  const { data } = await supabase
    .from('team_invitations')
    .select('*')
    .eq('team_id', teamId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (!data) return [];
  return data.map((d) => ({
    id: d.id,
    teamId: d.team_id,
    email: d.email,
    role: d.role,
    invitedBy: d.invited_by,
    token: d.token,
    expiresAt: d.expires_at,
    acceptedAt: d.accepted_at,
    createdAt: d.created_at,
  }));
}

export async function revokeInvitation(inviteId: string, teamId: string, userId: string): Promise<void> {
  const role = await verifyTeamAccess(teamId, userId);
  if (role !== 'owner' && role !== 'member') throw new Error('Access denied');

  const { error } = await supabase
    .from('team_invitations')
    .delete()
    .eq('id', inviteId)
    .eq('team_id', teamId);
  if (error) throw new Error(`Failed to revoke invitation: ${error.message}`);
}

export async function deleteTeam(teamId: string, userId: string): Promise<void> {
  const role = await verifyTeamAccess(teamId, userId);
  if (role !== 'owner') throw new Error('Only team owners can delete a team');

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);
  if (error) throw new Error(`Failed to delete team: ${error.message}`);
}

export async function verifyTeamAccess(teamId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return data?.role ?? null;
}

export async function verifyTeamWriteAccess(teamId: string, userId: string): Promise<boolean> {
  const role = await verifyTeamAccess(teamId, userId);
  return role === 'owner' || role === 'member';
}
