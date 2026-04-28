import { supabase } from './supabase';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms timestamp
}

export interface AnalyticsConfig {
  propertyId: string;
  serviceAccountJson?: string;
  oauth?: OAuthTokens;
  authMethod: 'service_account' | 'oauth';
  updatedAt: string;
  ownerUserId: string;
  teamId: string | null;
}

export type ConfigScope =
  | { kind: 'personal'; userId: string }
  | { kind: 'team'; teamId: string };

function rowToConfig(row: Record<string, unknown>): AnalyticsConfig {
  const config: AnalyticsConfig = {
    propertyId: (row.property_id as string) || '',
    authMethod: row.auth_method as 'service_account' | 'oauth',
    updatedAt: row.updated_at as string,
    ownerUserId: row.user_id as string,
    teamId: (row.team_id as string | null) ?? null,
  };
  if (row.service_account_json) {
    config.serviceAccountJson = row.service_account_json as string;
  }
  if (row.oauth_access_token) {
    config.oauth = {
      accessToken: row.oauth_access_token as string,
      refreshToken: row.oauth_refresh_token as string,
      expiresAt: row.oauth_expires_at as number,
    };
  }
  return config;
}

export async function getAnalyticsConfig(scope: ConfigScope): Promise<AnalyticsConfig | undefined> {
  const query = supabase.from('analytics_configs').select('*');
  const filtered = scope.kind === 'personal'
    ? query.eq('user_id', scope.userId).is('team_id', null)
    : query.eq('team_id', scope.teamId);
  const { data } = await filtered.maybeSingle();
  return data ? rowToConfig(data) : undefined;
}

export async function setAnalyticsConfig(
  scope: ConfigScope,
  connectingUserId: string,
  propertyId: string,
  serviceAccountJson: string,
): Promise<void> {
  const existing = await getAnalyticsConfig(scope);
  const row = {
    user_id: scope.kind === 'personal' ? scope.userId : connectingUserId,
    team_id: scope.kind === 'team' ? scope.teamId : null,
    property_id: propertyId,
    service_account_json: serviceAccountJson,
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_expires_at: null,
    auth_method: 'service_account' as const,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const upd = supabase.from('analytics_configs').update(row);
    if (scope.kind === 'personal') await upd.eq('user_id', scope.userId).is('team_id', null);
    else await upd.eq('team_id', scope.teamId);
  } else {
    await supabase.from('analytics_configs').insert(row);
  }
}

export async function setAnalyticsOAuth(
  scope: ConfigScope,
  connectingUserId: string,
  tokens: OAuthTokens,
): Promise<void> {
  const existing = await getAnalyticsConfig(scope);
  const row = {
    user_id: scope.kind === 'personal' ? scope.userId : connectingUserId,
    team_id: scope.kind === 'team' ? scope.teamId : null,
    property_id: existing?.propertyId ?? '',
    oauth_access_token: tokens.accessToken,
    oauth_refresh_token: tokens.refreshToken,
    oauth_expires_at: tokens.expiresAt,
    auth_method: 'oauth' as const,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const upd = supabase.from('analytics_configs').update(row);
    if (scope.kind === 'personal') await upd.eq('user_id', scope.userId).is('team_id', null);
    else await upd.eq('team_id', scope.teamId);
  } else {
    await supabase.from('analytics_configs').insert(row);
  }
}

export async function setAnalyticsPropertyId(scope: ConfigScope, propertyId: string): Promise<void> {
  const updates = { property_id: propertyId, updated_at: new Date().toISOString() };
  const upd = supabase.from('analytics_configs').update(updates);
  const { error } = scope.kind === 'personal'
    ? await upd.eq('user_id', scope.userId).is('team_id', null)
    : await upd.eq('team_id', scope.teamId);
  if (error) throw new Error(`Failed to update property ID: ${error.message}`);
}

export async function updateOAuthTokens(scope: ConfigScope, tokens: Partial<OAuthTokens>): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tokens.accessToken !== undefined) updates.oauth_access_token = tokens.accessToken;
  if (tokens.refreshToken !== undefined) updates.oauth_refresh_token = tokens.refreshToken;
  if (tokens.expiresAt !== undefined) updates.oauth_expires_at = tokens.expiresAt;

  const upd = supabase.from('analytics_configs').update(updates);
  if (scope.kind === 'personal') await upd.eq('user_id', scope.userId).is('team_id', null);
  else await upd.eq('team_id', scope.teamId);
}

export async function disconnectAnalytics(scope: ConfigScope): Promise<void> {
  const del = supabase.from('analytics_configs').delete();
  if (scope.kind === 'personal') await del.eq('user_id', scope.userId).is('team_id', null);
  else await del.eq('team_id', scope.teamId);
}

export type TransferResult = 'ok' | 'source_missing' | 'target_exists' | 'forbidden';

/**
 * Atomically flip an existing config between personal and team scope.
 *
 * `to_team`:     personal(userId, NULL) → team(userId, teamId).      Caller is the personal owner.
 * `to_personal`: team(userId, teamId)   → personal(userId, NULL).    Caller is the team config's token owner.
 *
 * Token ownership (`user_id`) stays with the caller in both directions. The partial unique indexes
 * (`(user_id) WHERE team_id IS NULL`, `(team_id) WHERE team_id IS NOT NULL`) reject the UPDATE
 * if the target scope is already occupied → returned as `target_exists`.
 */
export async function transferAnalyticsConfig(
  direction: 'to_team' | 'to_personal',
  userId: string,
  teamId: string,
): Promise<TransferResult> {
  if (direction === 'to_team') {
    const source = await getAnalyticsConfig({ kind: 'personal', userId });
    if (!source) return 'source_missing';
    const target = await getAnalyticsConfig({ kind: 'team', teamId });
    if (target) return 'target_exists';
    const { error } = await supabase
      .from('analytics_configs')
      .update({ team_id: teamId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('team_id', null);
    if (error) {
      if (error.code === '23505') return 'target_exists';
      throw new Error(`Transfer failed: ${error.message}`);
    }
    return 'ok';
  }

  // to_personal — caller must be the token owner of the team config
  const source = await getAnalyticsConfig({ kind: 'team', teamId });
  if (!source) return 'source_missing';
  if (source.ownerUserId !== userId) return 'forbidden';
  const target = await getAnalyticsConfig({ kind: 'personal', userId });
  if (target) return 'target_exists';
  const { error } = await supabase
    .from('analytics_configs')
    .update({ team_id: null, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) {
    if (error.code === '23505') return 'target_exists';
    throw new Error(`Transfer failed: ${error.message}`);
  }
  return 'ok';
}
