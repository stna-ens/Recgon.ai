// Phase 2 (SKILL-03). CRUD against `teammate_inferred_skills` introduced by
// `supabase/migrations/20260513_inferred_skills.sql`. Mirrors the pattern in
// `src/lib/recgon/profileStorage.ts`: thin wrappers around the service-role
// Supabase client with snake_case ↔ camelCase mapping.
//
// All access is server-side via the service-role client; the UI never imports
// this module directly — it goes through `/api/teams/[id]/inferred-skills`.

import { supabase } from '../supabase';
import type {
  InferredSkill,
  InferredSkillSource,
  UpsertInferredSkillInput,
} from './types';

type InferredSkillRow = {
  id: string;
  teammate_id: string;
  team_id: string;
  canonical_tag: string;
  score: number | string;
  source: InferredSkillSource;
  last_seen_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
  user_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Map a snake_case DB row into the camelCase domain type. */
export function mapInferredSkill(row: InferredSkillRow): InferredSkill {
  return {
    id: row.id,
    teammateId: row.teammate_id,
    teamId: row.team_id,
    canonicalTag: row.canonical_tag,
    // Supabase returns numeric columns as `string | number`; coerce here.
    score: Number(row.score),
    source: row.source,
    lastSeenAt: row.last_seen_at,
    confirmedAt: row.confirmed_at,
    rejectedAt: row.rejected_at,
    userReviewedAt: row.user_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * SKILL-03: list all inferred-skill rows for a teammate (accepted + rejected),
 * ordered by `last_seen_at` desc. Used by the API GET endpoint that feeds
 * the inferred-skills UI section.
 */
export async function listInferredSkills(
  teammateId: string,
): Promise<InferredSkill[]> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .select('*')
    .eq('teammate_id', teammateId)
    .order('last_seen_at', { ascending: false });
  if (error) throw new Error(`listInferredSkills failed: ${error.message}`);
  return (data ?? []).map((r) => mapInferredSkill(r as InferredSkillRow));
}

/**
 * SKILL-04: list only accepted (non-rejected) rows. Consumed by
 * `profileMerge` for the 3-source blend and by the rail UI's accepted-pill
 * list. Equivalent to `listInferredSkills` filtered to `rejected_at IS NULL`,
 * served by the partial index `idx_tis_teammate_active`.
 */
export async function listActiveInferredSkills(
  teammateId: string,
): Promise<InferredSkill[]> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .select('*')
    .eq('teammate_id', teammateId)
    .is('rejected_at', null)
    .order('last_seen_at', { ascending: false });
  if (error) {
    throw new Error(`listActiveInferredSkills failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapInferredSkill(r as InferredSkillRow));
}

/**
 * SKILL-03: single-row read by id. Used by the PATCH endpoint's IDOR check
 * (verify the row's team_id matches the request's teamId before mutating).
 */
export async function getInferredSkill(
  id: string,
): Promise<InferredSkill | null> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getInferredSkill failed: ${error.message}`);
  if (!data) return null;
  return mapInferredSkill(data as InferredSkillRow);
}

/**
 * SKILL-03 / D-22: upsert one inferred-skill row keyed on
 * `(teammate_id, canonical_tag)`. On conflict, UPDATEs `score`, `source`,
 * `last_seen_at` only — PRESERVES `rejected_at`, `confirmed_at`, and
 * `user_reviewed_at` so a once-rejected tag stays rejected across re-scans.
 *
 * Supabase's `.upsert` does not support a per-column UPDATE list directly,
 * so we use the `ignoreDuplicates: false` upsert mode with an explicit
 * payload that omits the preserved-on-conflict fields. (Lifecycle columns
 * default to null at insert time and stay null until the user acts.)
 */
export async function upsertInferredSkill(
  input: UpsertInferredSkillInput,
): Promise<InferredSkill> {
  // First, try to UPDATE the existing row's worker-owned fields. If no row
  // matched, INSERT a fresh one. This two-step shape is the only way to
  // preserve `rejected_at` / `confirmed_at` / `user_reviewed_at` on conflict
  // without smuggling them into the upsert payload (where they'd null out
  // on the worker's re-write).
  const existing = await supabase
    .from('teammate_inferred_skills')
    .select('id')
    .eq('teammate_id', input.teammateId)
    .eq('canonical_tag', input.canonicalTag)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`upsertInferredSkill (lookup) failed: ${existing.error.message}`);
  }

  if (existing.data) {
    const { data, error } = await supabase
      .from('teammate_inferred_skills')
      .update({
        score: input.score,
        source: input.source,
        last_seen_at: input.lastSeenAt,
      })
      .eq('id', existing.data.id)
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`upsertInferredSkill (update) failed: ${error?.message}`);
    }
    return mapInferredSkill(data as InferredSkillRow);
  }

  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .insert({
      teammate_id: input.teammateId,
      team_id: input.teamId,
      canonical_tag: input.canonicalTag,
      score: input.score,
      source: input.source,
      last_seen_at: input.lastSeenAt,
    })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`upsertInferredSkill (insert) failed: ${error?.message}`);
  }
  return mapInferredSkill(data as InferredSkillRow);
}

/**
 * SKILL-05 / D-24: permanent reject. Sets `rejected_at = now()` for the row.
 * The unique `(teammate_id, canonical_tag)` index prevents accidental
 * resurfacing on the next scan; the worker also filters via `listRejectedTags`.
 */
export async function rejectInferredSkill(id: string): Promise<InferredSkill> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .update({ rejected_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`rejectInferredSkill failed: ${error?.message}`);
  }
  return mapInferredSkill(data as InferredSkillRow);
}

/**
 * SKILL-05: supports the 6-second undo window in the UI. Sets `rejected_at`
 * back to null. After the undo window closes, the rejection is permanent
 * (no further client-side path resets it).
 */
export async function undoRejection(id: string): Promise<InferredSkill> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .update({ rejected_at: null })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`undoRejection failed: ${error?.message}`);
  }
  return mapInferredSkill(data as InferredSkillRow);
}

/**
 * SKILL-03 / T-02-03: list canonical_tag values that the teammate has
 * permanently rejected. Consumed by the worker BEFORE emitting new rows so
 * a once-rejected (teammate_id, canonical_tag) never re-suggests.
 * Served by the partial index `idx_tis_teammate_rejected`.
 */
export async function listRejectedTags(
  teammateId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .select('canonical_tag')
    .eq('teammate_id', teammateId)
    .not('rejected_at', 'is', null);
  if (error) throw new Error(`listRejectedTags failed: ${error.message}`);
  return (data ?? []).map((r) => (r as { canonical_tag: string }).canonical_tag);
}

/**
 * SKILL-06: bulk-mark all unreviewed, non-rejected rows for this teammate
 * as reviewed. Called when the teammate dismisses the "N new inferred
 * skills" banner. Banner suppression is row-count-driven (see Pitfall 7);
 * this is the only path that clears the unreviewed count.
 */
export async function markBannerReviewed(
  teammateId: string,
): Promise<void> {
  const { error } = await supabase
    .from('teammate_inferred_skills')
    .update({ user_reviewed_at: new Date().toISOString() })
    .eq('teammate_id', teammateId)
    .is('user_reviewed_at', null)
    .is('rejected_at', null);
  if (error) throw new Error(`markBannerReviewed failed: ${error.message}`);
}

/**
 * SKILL-03 / T-02-02: resolve the underlying `users.id` (TEXT) for a
 * teammate row. Used by the API-route IDOR check in Plan 02-03: a teammate
 * may only mutate their OWN inferred-skill rows.
 *
 * Returns null when the teammate is an AI agent (no user_id) or the
 * teammate row is missing.
 */
export async function getTeammateUserId(
  teammateId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('teammates')
    .select('user_id')
    .eq('id', teammateId)
    .maybeSingle();
  if (error) throw new Error(`getTeammateUserId failed: ${error.message}`);
  if (!data) return null;
  return (data as { user_id: string | null }).user_id ?? null;
}

/**
 * Phase 2 / Plan 02-03 helper: resolve the canonical `teammates.id` for a
 * (teamId, userId) pair. Used by the API routes to map session.user.id back
 * to the row whose `teammate_inferred_skills` we operate on. Returns null if
 * the user has no `teammates` row in this team (e.g. invited but never
 * mirrored — defensive guard).
 */
export async function getTeammateByTeamUser(
  teamId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('teammates')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .neq('status', 'retired')
    .maybeSingle();
  if (error) throw new Error(`getTeammateByTeamUser failed: ${error.message}`);
  if (!data) return null;
  return { id: (data as { id: string }).id };
}

/**
 * Phase 2 / Plan 02-03 helper: read mining status (`github_mining_consent_at`
 * + `last_scan_at`) from `teammate_profiles`. The `profileStorage` mapper
 * doesn't include these columns in its typed view (they live on the same
 * row but are owned by the mining flow, not the self-declared profile), so
 * we read them directly here. Returns null when no profile row exists yet.
 */
export async function getMiningStatus(
  teamId: string,
  userId: string,
): Promise<{ githubMiningConsentAt: string | null; lastScanAt: string | null } | null> {
  const { data, error } = await supabase
    .from('teammate_profiles')
    .select('github_mining_consent_at, last_scan_at')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`getMiningStatus failed: ${error.message}`);
  if (!data) return null;
  const row = data as {
    github_mining_consent_at: string | null;
    last_scan_at: string | null;
  };
  return {
    githubMiningConsentAt: row.github_mining_consent_at,
    lastScanAt: row.last_scan_at,
  };
}

/**
 * Phase 2 / Plan 02-03 / SKILL-05: mark a single inferred-skill row as
 * reviewed (`user_reviewed_at = now()`). Used by the per-row PATCH endpoint
 * when the caller passes `{ reviewed: true }`. Bulk-banner-dismiss flows
 * through `markBannerReviewed` instead.
 */
export async function markInferredSkillReviewed(id: string): Promise<InferredSkill> {
  const { data, error } = await supabase
    .from('teammate_inferred_skills')
    .update({ user_reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`markInferredSkillReviewed failed: ${error?.message}`);
  }
  return mapInferredSkill(data as InferredSkillRow);
}

/**
 * Phase 2 / Plan 02-03 / SKILL-01: unset `teammate_profiles.github_mining_consent_at`
 * for (teamId, userId). Used by `DELETE /inferred-skills/consent` (Stop mining).
 * Does NOT touch teammate_inferred_skills rows — accepted/rejected pills survive
 * per D-22.
 */
export async function clearMiningConsent(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('teammate_profiles')
    .update({ github_mining_consent_at: null })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw new Error(`clearMiningConsent failed: ${error.message}`);
}

/**
 * Phase 2 / Plan 02-03 / SKILL-01: set `teammate_profiles.github_mining_consent_at = now()`
 * for (teamId, userId). Called by the OAuth callback when the
 * `github_skill_mining_state` cookie flow completes successfully. Upserts the
 * profile row if it doesn't yet exist — a teammate can grant consent before
 * they've ever opened the profile form.
 */
export async function setMiningConsent(teamId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  // Try update first; if no row was affected, insert.
  const { data, error } = await supabase
    .from('teammate_profiles')
    .update({ github_mining_consent_at: now })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`setMiningConsent (update) failed: ${error.message}`);
  if (data) return;
  // No existing row → insert a minimal one. Profile fields default to empty.
  const ins = await supabase
    .from('teammate_profiles')
    .insert({
      team_id: teamId,
      user_id: userId,
      github_mining_consent_at: now,
    });
  if (ins.error) {
    throw new Error(`setMiningConsent (insert) failed: ${ins.error.message}`);
  }
}
