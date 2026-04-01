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
}

function rowToConfig(row: Record<string, unknown>): AnalyticsConfig {
  const config: AnalyticsConfig = {
    propertyId: (row.property_id as string) ?? '',
    authMethod: row.auth_method as 'service_account' | 'oauth',
    updatedAt: row.updated_at as string,
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

export async function getAnalyticsConfig(userId: string): Promise<AnalyticsConfig | undefined> {
  const { data } = await supabase
    .from('analytics_configs')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data ? rowToConfig(data) : undefined;
}

export async function setAnalyticsConfig(userId: string, propertyId: string, serviceAccountJson: string): Promise<void> {
  await supabase.from('analytics_configs').upsert({
    user_id: userId,
    property_id: propertyId,
    service_account_json: serviceAccountJson,
    auth_method: 'service_account',
    updated_at: new Date().toISOString(),
  });
}

export async function setAnalyticsOAuth(userId: string, tokens: OAuthTokens): Promise<void> {
  const existing = await getAnalyticsConfig(userId);
  await supabase.from('analytics_configs').upsert({
    user_id: userId,
    property_id: existing?.propertyId ?? '',
    oauth_access_token: tokens.accessToken,
    oauth_refresh_token: tokens.refreshToken,
    oauth_expires_at: tokens.expiresAt,
    auth_method: 'oauth',
    updated_at: new Date().toISOString(),
  });
}

export async function setAnalyticsPropertyId(userId: string, propertyId: string): Promise<void> {
  const { error } = await supabase
    .from('analytics_configs')
    .update({
      property_id: propertyId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to update property ID: ${error.message}`);
}

export async function updateOAuthTokens(userId: string, tokens: Partial<OAuthTokens>): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tokens.accessToken !== undefined) updates.oauth_access_token = tokens.accessToken;
  if (tokens.refreshToken !== undefined) updates.oauth_refresh_token = tokens.refreshToken;
  if (tokens.expiresAt !== undefined) updates.oauth_expires_at = tokens.expiresAt;

  await supabase
    .from('analytics_configs')
    .update(updates)
    .eq('user_id', userId);
}

export async function disconnectAnalytics(userId: string): Promise<void> {
  await supabase.from('analytics_configs').delete().eq('user_id', userId);
}
