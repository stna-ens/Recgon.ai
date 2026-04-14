import { supabase } from './supabase';

export type ActivitySource = 'gui' | 'terminal' | 'system';
export type ActivityStatus = 'started' | 'succeeded' | 'failed';

export interface Activity {
  id: string;
  teamId: string;
  projectId?: string;
  userId: string;
  source: ActivitySource;
  toolName: string;
  args: Record<string, unknown>;
  status: ActivityStatus;
  resultSummary?: string;
  error?: string;
  createdAt: string;
}

interface LogActivityInput {
  teamId: string;
  userId: string;
  projectId?: string;
  source: ActivitySource;
  toolName: string;
  args?: Record<string, unknown>;
  status: ActivityStatus;
  resultSummary?: string;
  error?: string;
}

export async function logActivity(input: LogActivityInput): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      team_id: input.teamId,
      user_id: input.userId,
      project_id: input.projectId ?? null,
      source: input.source,
      tool_name: input.toolName,
      args: input.args ?? {},
      status: input.status,
      result_summary: input.resultSummary ?? null,
      error: input.error ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[activityLog] failed to insert', error);
    return undefined;
  }
  return data?.id as string | undefined;
}

export async function updateActivity(
  id: string,
  patch: { status?: ActivityStatus; resultSummary?: string; error?: string },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.resultSummary !== undefined) update.result_summary = patch.resultSummary;
  if (patch.error !== undefined) update.error = patch.error;
  const { error } = await supabase.from('activities').update(update).eq('id', id);
  if (error) console.error('[activityLog] failed to update', error);
}

function rowToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    projectId: (row.project_id as string | null) ?? undefined,
    userId: row.user_id as string,
    source: row.source as ActivitySource,
    toolName: row.tool_name as string,
    args: (row.args as Record<string, unknown>) ?? {},
    status: row.status as ActivityStatus,
    resultSummary: (row.result_summary as string | null) ?? undefined,
    error: (row.error as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function getRecentActivities(
  teamId: string,
  opts: { sinceHours?: number; limit?: number; projectId?: string } = {},
): Promise<Activity[]> {
  const { sinceHours = 24, limit = 20, projectId } = opts;
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();

  let q = supabase
    .from('activities')
    .select('*')
    .eq('team_id', teamId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (projectId) q = q.eq('project_id', projectId);

  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToActivity);
}

export function formatActivitiesForPrompt(activities: Activity[]): string {
  if (activities.length === 0) return 'No recent activity.';
  return activities
    .map((a) => {
      const when = new Date(a.createdAt).toISOString().replace('T', ' ').slice(0, 16);
      const who = a.source === 'gui' ? 'GUI' : a.source === 'terminal' ? 'terminal' : 'system';
      const summary = a.resultSummary ?? a.error ?? a.status;
      return `- [${when}] (${who}) ${a.toolName}: ${summary}`;
    })
    .join('\n');
}
