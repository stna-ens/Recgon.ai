// Per-project integration credentials (Instagram Graph, future platforms).
//
// Service-role-only — never call this from client components. Only API routes
// authenticated against the team should read/write.

import { supabase } from './supabase';

export type IntegrationProvider = 'instagram';

export type ProjectIntegration = {
  id: string;
  projectId: string;
  teamId: string;
  provider: IntegrationProvider;
  accountId: string | null;
  accountHandle: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
  connectedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function map(row: Row): ProjectIntegration {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    teamId: row.team_id as string,
    provider: row.provider as IntegrationProvider,
    accountId: (row.account_id as string | null) ?? null,
    accountHandle: (row.account_handle as string | null) ?? null,
    accessToken: (row.access_token as string | null) ?? null,
    refreshToken: (row.refresh_token as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    connectedBy: (row.connected_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getIntegration(
  projectId: string,
  provider: IntegrationProvider,
): Promise<ProjectIntegration | null> {
  const { data } = await supabase
    .from('project_integrations')
    .select('*')
    .eq('project_id', projectId)
    .eq('provider', provider)
    .maybeSingle();
  return data ? map(data as Row) : null;
}

export async function listIntegrations(projectId: string): Promise<ProjectIntegration[]> {
  const { data } = await supabase
    .from('project_integrations')
    .select('*')
    .eq('project_id', projectId);
  return ((data ?? []) as Row[]).map(map);
}

export async function upsertIntegration(input: {
  projectId: string;
  teamId: string;
  provider: IntegrationProvider;
  accountId?: string | null;
  accountHandle?: string | null;
  accessToken: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  connectedBy: string;
}): Promise<ProjectIntegration> {
  const { data, error } = await supabase
    .from('project_integrations')
    .upsert(
      {
        project_id: input.projectId,
        team_id: input.teamId,
        provider: input.provider,
        account_id: input.accountId ?? null,
        account_handle: input.accountHandle ?? null,
        access_token: input.accessToken,
        refresh_token: input.refreshToken ?? null,
        expires_at: input.expiresAt ?? null,
        metadata: input.metadata ?? {},
        connected_by: input.connectedBy,
      },
      { onConflict: 'project_id,provider' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`upsertIntegration failed: ${error?.message}`);
  return map(data as Row);
}

export async function deleteIntegration(
  projectId: string,
  provider: IntegrationProvider,
): Promise<void> {
  await supabase
    .from('project_integrations')
    .delete()
    .eq('project_id', projectId)
    .eq('provider', provider);
}
