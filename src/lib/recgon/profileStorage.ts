// Recgon teammate profile storage — CRUD against the `teammate_profiles`
// table introduced by `supabase/migrations/20260512_teammate_profiles.sql`
// (Plan 01-01). Mirrors the pattern in `src/lib/recgon/storage.ts`: thin
// wrappers around the service-role Supabase client with snake_case ↔
// camelCase mapping. PROFILE-03 / Phase 1 (Plan 01-03).
//
// All access is server-side via the service-role client; the form UI never
// imports this module directly — it goes through `/api/teams/[id]/profile`.

import { supabase } from '../supabase';
import type { TeammateProfile } from './types';

type TeammateProfileRow = {
  id: string;
  team_id: string;
  user_id: string;
  skills_raw: string[] | null;
  strengths_raw: string[] | null;
  interests_raw: string[] | null;
  skills_canonical: string[] | null;
  strengths_canonical: string[] | null;
  interests_canonical: string[] | null;
  weekly_capacity_hours: number | string | null;
  normalization_pending: boolean | null;
  created_at: string;
  updated_at: string;
  // Phase 2 columns. These were added by the inferred-skills migration but
  // were missed by the original mapper, which caused `runGithubSkillInference`
  // to read `consentAt` as undefined → `no_consent` early-exit on every scan.
  github_mining_consent_at: string | null;
  last_scan_at: string | null;
};

export function mapTeammateProfile(row: TeammateProfileRow): TeammateProfile {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    skillsRaw: row.skills_raw ?? [],
    strengthsRaw: row.strengths_raw ?? [],
    interestsRaw: row.interests_raw ?? [],
    skillsCanonical: row.skills_canonical ?? [],
    strengthsCanonical: row.strengths_canonical ?? [],
    interestsCanonical: row.interests_canonical ?? [],
    weeklyCapacityHours:
      row.weekly_capacity_hours === null || row.weekly_capacity_hours === undefined
        ? null
        : Number(row.weekly_capacity_hours),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    githubMiningConsentAt: row.github_mining_consent_at ?? null,
    lastScanAt: row.last_scan_at ?? null,
  };
}

export async function getProfile(
  teamId: string,
  userId: string,
): Promise<TeammateProfile | null> {
  const { data, error } = await supabase
    .from('teammate_profiles')
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile failed: ${error.message}`);
  if (!data) return null;
  return mapTeammateProfile(data as TeammateProfileRow);
}

export async function listProfiles(teamId: string): Promise<TeammateProfile[]> {
  const { data, error } = await supabase
    .from('teammate_profiles')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listProfiles failed: ${error.message}`);
  return (data ?? []).map((r) => mapTeammateProfile(r as TeammateProfileRow));
}

export type UpsertProfileInput = {
  teamId: string;
  userId: string;
  skillsRaw: string[];
  strengthsRaw: string[];
  interestsRaw: string[];
  skillsCanonical: string[];
  strengthsCanonical: string[];
  interestsCanonical: string[];
  weeklyCapacityHours: number | null;
  normalizationPending: boolean;
};

export async function upsertProfile(input: UpsertProfileInput): Promise<TeammateProfile> {
  const { data, error } = await supabase
    .from('teammate_profiles')
    .upsert(
      {
        team_id: input.teamId,
        user_id: input.userId,
        skills_raw: input.skillsRaw,
        strengths_raw: input.strengthsRaw,
        interests_raw: input.interestsRaw,
        skills_canonical: input.skillsCanonical,
        strengths_canonical: input.strengthsCanonical,
        interests_canonical: input.interestsCanonical,
        weekly_capacity_hours: input.weeklyCapacityHours,
        normalization_pending: input.normalizationPending,
      },
      { onConflict: 'team_id,user_id' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(`upsertProfile failed: ${error?.message}`);
  return mapTeammateProfile(data as TeammateProfileRow);
}
