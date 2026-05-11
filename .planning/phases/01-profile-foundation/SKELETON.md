---
phase: 01-profile-foundation
type: walking_skeleton
created: 2026-05-11
---

# Walking Skeleton — Phase 1: Profile Foundation

This document records the architectural decisions made by the thinnest end-to-end working slice (Plan 01). Subsequent plans build on these decisions without renegotiating them. Phases 2–6 inherit this skeleton unchanged.

## Slice goal

A logged-in teammate visits `/teams/[id]/me`, sees a form, types one skill into a `cmdk`-powered picker, hits **Save**, and the value persists to a real Supabase row in `teammate_profiles`. On the next dispatcher cron run, `profileMerge` reads that row and the matcher sees the new skill. No stubs, no fake data, no mocked LLM — but normalization may be deferred to the next milestone task if the LLM is unhealthy (raw-text fallback, see Pitfall 7 in RESEARCH).

## Frozen architectural decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15 (App Router) — already locked by PROJECT.md | No swap allowed in v3. |
| DB | Supabase (Postgres) via service-role client `src/lib/supabase.ts` | All existing storage uses this path. New `teammate_profiles` table follows the additive-migration pattern from `20260428_project_integrations.sql`. |
| Auth | NextAuth v5 (JWT) via `src/auth.ts` + `verifyTeamAccess` from `src/lib/teamStorage.ts` | Every existing team-scoped surface already uses this. No new auth code. |
| LLM call path | `chatViaChain` (Gemini → Claude fallback) at `temperature: 0`, `taskKind: 'recgon_skill_normalize'`, `promptVersion: 'v1'` | QUAL-05, QUAL-06. Single call on save, synchronous. |
| Prompts/schemas registries | `src/lib/prompts.ts` + `src/lib/schemas.ts` — hard rule, never inline | CLAUDE.md / CONVENTIONS.md. |
| Skill picker primitive | `cmdk@^1.1.1` (NEW dep) + `@radix-ui/react-popover` (existing) | RESEARCH Standard Stack. Hand-rolling forbidden by CLAUDE.md UI Components rule. |
| Canonical vocab source | `src/lib/recgon/skillVocabulary.ts` (new const module, extracted from `prompts.ts` lines 893-895) | PROFILE-02 mandates single source; `skillTagger.ts` is refactored to import from it. |
| Profile data model | `teammate_profiles` table keyed by unique `(team_id, user_id)`. Stores both `*_raw` AND `*_canonical` text[] columns for skills/strengths/interests + `weekly_capacity_hours numeric`. | D-04, D-14. Additive — `teammates` row never mutated. |
| Visibility | `profile_visibility text` column ADDED to existing `teams` table, values `team_visible` (default) \| `owner_only`. Enforced server-side at read time. | D-17/18/19; new column avoids a new `team_settings` table for a single boolean. |
| Merge function | `profileMerge(teammate, profile, inferred=null, ema)` — pure, no IO, in `src/lib/recgon/profileMerge.ts`. Field-level fallback (D-06, D-08). Returns `Teammate & { interests?: string[] }`. | PROFILE-04. Phase 2 slots `inferred` in without touching this signature. |
| Dispatcher wiring point | `src/lib/recgon/dispatcher.ts:116` — immediately after `listTeammatesWithStats(teamId)`, before `rankMatches`. | RESEARCH Architectural Responsibility Map. One-call insertion. |
| Math touch budget | `src/lib/recgon/match.ts` — ONE additive interest-nudge term in `scoreTeammateForTask`, after the weighted sum, capped at ≤ 0.05 (planner picks ≤ 0.03 starting value per Pitfall 3). | D-03. Only allowed math touch in Phase 1. |
| Deployment | Vercel — `/api/teams/[id]/profile` route MUST override `vercel.json` maxDuration to ≥ 30s OR call `chatViaChain` with `timeoutMs: 8000`. We choose option (b): explicit 8s timeout per Pitfall 8. | Existing deployment path. |
| Failure mode | LLM unhealthy → persist `raw` + `canonical: []`, return 200 with banner copy; never lose the user's typed text. | Pitfall 7. |

## Directory layout (frozen)

```
src/
├── app/
│   ├── teams/[id]/me/
│   │   ├── page.tsx              # NEW — RSC, auth + verifyTeamAccess + load profile
│   │   └── ProfileForm.tsx       # NEW — 'use client', cmdk picker
│   └── api/teams/[id]/profile/
│       └── route.ts              # NEW — POST: normalize + upsert
├── lib/
│   ├── recgon/
│   │   ├── skillVocabulary.ts    # NEW — canonical const module
│   │   ├── profileMerge.ts       # NEW — pure merge fn
│   │   ├── profileStorage.ts     # NEW — teammate_profiles CRUD
│   │   ├── normalizeProfile.ts   # NEW — chatViaChain wrapper + post-hoc filter
│   │   ├── match.ts              # MOD — interest-nudge term only
│   │   ├── dispatcher.ts         # MOD — thread profileMerge before rankMatches
│   │   ├── skillTagger.ts        # MOD — import vocab from skillVocabulary.ts
│   │   └── types.ts              # MOD — add TeammateProfile, ProfileVisibility
│   ├── prompts.ts                # MOD — add SKILL_NORMALIZE_SYSTEM + builder
│   └── schemas.ts                # MOD — SkillNormalizationResultSchema + ProfileSaveBodySchema
└── supabase/migrations/
    └── 20260512_teammate_profiles.sql  # NEW — table + visibility column + trigger
```

## What this skeleton does NOT decide (deferred per phase)

- Exact interest-nudge weight (Plan 02 picks via simulation; cap ≤ 0.05).
- Exact self-vs-EMA merge weight ratios in `profileMerge` (Plan 02 simulates).
- Suggestion-chip ranking algorithm (Plan 03 picks; prefix → fuzzy → recent-others).
- Cross-teammate profile viewing UI for `team_visible` mode (Plan 03 owns; server-side authorization is mandatory).
- GitHub-inference column on `teammate_profiles` (Phase 2 adds `consent_github_at`).

## Skeleton acceptance (proves the slice walks end-to-end)

After Plan 01 ships:

1. `supabase db push` applied; `teammate_profiles` exists; `teams.profile_visibility` exists.
2. `npm run build` passes — `cmdk` resolves; no client-side Supabase import.
3. `npm run test -- --run src/__tests__/skillVocabulary.test.ts` passes (vocab parity with `prompts.ts`).
4. Visiting `/teams/[id]/me` returns 200 for a team member, 404 for a non-member, redirects to `/login` for anonymous.
5. POST `/api/teams/[id]/profile` with one raw skill persists a row to `teammate_profiles`; GET on reload shows the value.

Plans 02 / 03 / 04 add the merge math, the canonical-tag UI annotation, and the dispatcher integration smoke test on top of this skeleton.
