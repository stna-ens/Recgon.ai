---
phase: 01-profile-foundation
plan: 01
subsystem: dispatcher-substrate
tags: [supabase, migration, canonical-vocab, cmdk, walking-skeleton, PROFILE-02, PROFILE-03]
dependency_graph:
  requires: []
  provides:
    - canonical-skill-vocabulary
    - teammate_profiles-table
    - teams.profile_visibility-column
    - cmdk-dependency
    - TeammateProfile-type
  affects:
    - src/lib/prompts.ts
    - src/lib/recgon/skillTagger.ts
    - src/lib/recgon/types.ts
tech_stack:
  added: [cmdk@^1.1.1]
  patterns: [const-module-single-source-of-truth, additive-migration, supabase-trigger-touch-updated-at]
key_files:
  created:
    - src/lib/recgon/skillVocabulary.ts
    - src/__tests__/skillVocabulary.test.ts
    - supabase/migrations/20260512_teammate_profiles.sql
  modified:
    - src/lib/prompts.ts
    - src/lib/recgon/skillTagger.ts
    - src/lib/recgon/types.ts
    - package.json
    - package-lock.json
key_decisions:
  - "Canonical vocab lives ONLY in skillVocabulary.ts; prompts.ts and skillTagger.ts both import — Pitfall 1 mitigated"
  - "teammate_profiles uses text FKs to teams.id/users.id (NOT uuid) per existing schema — Pitfall 5"
  - "No RLS on teammate_profiles; service-role-only access matches CLAUDE.md key rule"
  - "profile_visibility added to teams table (single boolean) instead of new team_settings table — D-17/D-18"
  - "normalization_pending boolean added for Pitfall 7 (graceful LLM-degraded path in Plan 03)"
metrics:
  duration_seconds: 86
  task_count_completed: 3
  task_count_blocking_checkpoint: 1
  completed_date: 2026-05-11
  files_changed: 7
---

# Phase 1 Plan 01: Profile Foundation Walking-Skeleton Substrate — Summary

Established the Phase-1 walking-skeleton substrate: single-source-of-truth canonical skill vocabulary, additive Supabase migration for `teammate_profiles` + `teams.profile_visibility`, and `cmdk@^1.1.1` installed for downstream Plan 03 skill picker.

## What Was Built

### Task 1.1 — Canonical skill vocabulary single source of truth (commit `7dab916`)

- Created `src/lib/recgon/skillVocabulary.ts` exporting:
  - `CANONICAL_ROLES` (25 tokens, `as const` tuple matching `prompts.ts:893` left-to-right)
  - `CANONICAL_MODIFIERS` (9 tokens, matching `prompts.ts:895` left-to-right)
  - `CANONICAL_VOCAB` (union, `[...roles, ...modifiers] as const`)
  - `CanonicalTag` (`typeof CANONICAL_VOCAB[number]`)
  - `CANONICAL_SET` (`Set<string>` for O(1) membership)
  - `isCanonical(tag): tag is CanonicalTag` (type guard)
- Pure module — zero imports of Supabase, React, or Next types. Safe to import from server, client, and edge contexts.
- Module-doc states: "Single source of truth for Recgon canonical skill vocabulary. PROFILE-02. Phase 1 (2026-05-12)."
- Refactored `src/lib/prompts.ts:TAG_TASK_SKILLS_SYSTEM` to interpolate via `${CANONICAL_ROLES.join(', ')}` and `${CANONICAL_MODIFIERS.join(', ')}` — runtime string is byte-identical to the previous hard-coded version.
- Refactored `src/lib/recgon/skillTagger.ts:sanitizeTags` to defense-in-depth filter against `CANONICAL_SET` (drops any LLM-emitted token not in the canonical set — Pitfall 1 mitigated).
- Added `TeammateProfile` interface + `ProfileVisibility` type to `src/lib/recgon/types.ts` for Plan 02/03 consumers.
- Added `src/__tests__/skillVocabulary.test.ts` (5 tests: roles parity, modifiers parity, vocab union + dedup, set membership, prompts.ts interpolation regex check). All 5 pass.

### Task 1.2 — `teammate_profiles` migration + `teams.profile_visibility` column (commit `3a51b2e`)

- Created `supabase/migrations/20260512_teammate_profiles.sql`.
- New `teammate_profiles` table:
  - `id uuid pk`, `team_id text FK→teams(id)`, `user_id text FK→users(id)` (both `on delete cascade`).
  - Three pairs of text[] arrays for skills/strengths/interests (raw + canonical), all `default '{}'::text[]`.
  - `weekly_capacity_hours numeric` nullable (D-06 — blank ≠ zero).
  - `normalization_pending boolean default false` (Pitfall 7 — degraded LLM path).
  - `created_at`/`updated_at` with the `teammate_profiles_touch_updated_at` trigger (mirroring `20260428_project_integrations.sql`).
- Unique index `uq_teammate_profiles_team_user (team_id, user_id)` enforcing D-04 one-row-per-teammate-per-team.
- Additive index `idx_teammate_profiles_team (team_id)` for dispatcher batch reads.
- `alter table teams add column if not exists profile_visibility text not null default 'team_visible' check (profile_visibility in ('team_visible','owner_only'))` — D-17/D-18.
- No RLS, no data migration, no destructive statements (additive-only).

### Task 1.3 — `cmdk@^1.1.1` installed (commit `b039d8e`)

- `npm install cmdk@^1.1.1 --save` (no `--legacy-peer-deps`; cmdk peerDeps satisfied by React 19.2.4).
- Both `package.json` AND `package-lock.json` committed in the same commit (Pitfall 4).
- `npm run build` exits 0 — cmdk resolves at build time; no module-not-found.

## Verification Results

| Check | Result |
|---|---|
| `npm run test -- --run src/__tests__/skillVocabulary.test.ts` | 5/5 pass |
| `npx tsc --noEmit` | exits 0 |
| `npm run build` | exits 0 (cmdk resolves) |
| `grep -c 'CANONICAL_ROLES' src/lib/prompts.ts` | 2 (import + interpolation) |
| Literal `Roles:.*engineering.*legal` in prompts.ts | 0 (hardcoded list removed) |
| Literal `Modifiers.*hiring` in prompts.ts | 0 (hardcoded list removed) |
| `from './skillVocabulary'` in skillTagger.ts | 1 |
| `export interface TeammateProfile` in types.ts | 1 |
| `export type ProfileVisibility` in types.ts | 1 |
| `'cmdk':` in package.json | 1 (^1.1.1) |
| `node_modules/cmdk` in lockfile | present |
| Migration acceptance criteria (all 13 greps) | all pass |
| Destructive `drop table` in migration | 0 |

## Deviations from Plan

None — plan executed exactly as written. The `skillTagger.ts` already had no inlined predicate (the canonical list lived in the prompt only); the refactor added the `CANONICAL_SET` import and used it in `sanitizeTags` as planned (action paragraph 4 of Task 1.1).

## Authentication / Migration Gate (BLOCKING — Task 1.4 PENDING)

Task 1.4 (`checkpoint:human-action`) requires the operator to push the migration to live Supabase. This cannot be automated by the executor — it requires `SUPABASE_ACCESS_TOKEN` interactive consent and a manual confirmation that:

1. `supabase db push` applied `20260512_teammate_profiles` cleanly.
2. Supabase MCP `list_tables` confirms `teammate_profiles` exists.
3. `teams` table now has the `profile_visibility` column with default `'team_visible'`.

Without this push, Plan 03's `POST /api/teams/[id]/profile` would 500 (table missing) while every local test/build passes — the canonical false-positive scenario the plan flagged.

The migration file is committed at `supabase/migrations/20260512_teammate_profiles.sql`. The operator types `pushed` (or pastes the error) once verified.

## Commits

| Task | Commit | Description |
|---|---|---|
| 1.1 | `7dab916` | feat(01-01): extract canonical skill vocab into single source-of-truth module |
| 1.2 | `3a51b2e` | feat(01-01): add teammate_profiles migration + teams.profile_visibility |
| 1.3 | `b039d8e` | chore(01-01): install cmdk@^1.1.1 for skill picker |

## Threat Flags

None — all surface introduced in this plan is internal (const module, additive migration, internal devDep). No new network endpoints, no auth paths, no schema changes at trust boundaries beyond what is documented in the plan's `<threat_model>`.

## Self-Check: PASSED

- `src/lib/recgon/skillVocabulary.ts` — exists
- `src/__tests__/skillVocabulary.test.ts` — exists
- `supabase/migrations/20260512_teammate_profiles.sql` — exists
- `git log --oneline | grep -c '01-01'` — 3 commits found (`7dab916`, `3a51b2e`, `b039d8e`)
- `npm run build` — passes
- `npx tsc --noEmit` — passes
- `npm run test -- --run src/__tests__/skillVocabulary.test.ts` — passes
