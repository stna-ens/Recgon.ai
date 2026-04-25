import { supabase } from './supabase';
import type { AnalyticsData } from './analyticsEngine';
import type { AnalyticsInsights } from './schemas';

export interface SavedAnalyticsInsight {
  id: string;
  projectId?: string;
  teamId: string;
  userId: string;
  propertyId: string;
  days: number;
  dateRange?: string;
  overview: Record<string, unknown>;
  insights: AnalyticsInsights;
  rawData?: AnalyticsData;
  source: 'gui' | 'terminal' | 'system';
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): SavedAnalyticsInsight {
  return {
    id: row.id as string,
    projectId: (row.project_id as string | null) ?? undefined,
    teamId: row.team_id as string,
    userId: row.user_id as string,
    propertyId: row.property_id as string,
    days: row.days as number,
    dateRange: (row.date_range as string | null) ?? undefined,
    overview: (row.overview as Record<string, unknown>) ?? {},
    insights: row.insights as AnalyticsInsights,
    rawData: (row.raw_data as AnalyticsData | null) ?? undefined,
    source: row.source as SavedAnalyticsInsight['source'],
    createdAt: row.created_at as string,
  };
}

export async function saveAnalyticsInsight(input: {
  projectId?: string;
  teamId: string;
  userId: string;
  propertyId: string;
  days: number;
  dateRange?: string;
  overview: Record<string, unknown>;
  insights: AnalyticsInsights;
  rawData?: AnalyticsData;
  source: SavedAnalyticsInsight['source'];
}): Promise<SavedAnalyticsInsight> {
  const { data, error } = await supabase
    .from('analytics_insights')
    .insert({
      project_id: input.projectId ?? null,
      team_id: input.teamId,
      user_id: input.userId,
      property_id: input.propertyId,
      days: input.days,
      date_range: input.dateRange ?? null,
      overview: input.overview,
      insights: input.insights,
      raw_data: input.rawData ?? null,
      source: input.source,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save analytics insights: ${error.message}`);
  return mapRow(data as Record<string, unknown>);
}

export async function listAnalyticsInsights(input: {
  teamId: string;
  projectId?: string;
  propertyId?: string;
  limit?: number;
}): Promise<SavedAnalyticsInsight[]> {
  let query = supabase
    .from('analytics_insights')
    .select('*')
    .eq('team_id', input.teamId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 10);

  if (input.projectId) query = query.eq('project_id', input.projectId);
  if (input.propertyId) query = query.eq('property_id', input.propertyId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to read analytics insights: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}
