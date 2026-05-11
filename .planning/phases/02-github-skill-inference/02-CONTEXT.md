---
phase: 02-github-skill-inference
gathered: 2026-05-12
status: ready_for_planning
---

# Phase 2: GitHub Skill Inference — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A teammate **explicitly grants GitHub mining consent** on `/teams/[id]/me`. A worker then mines their commits in **team-connected repos only**, within a **6-month rolling window**, and surfaces inferred skills in a new **"Inferred from GitHub" section in the right preview rail**. Each inferred skill is **active in the dispatcher immediately** but can be **rejected per-skill** (rejection is permanent — re-mining never re-suggests it). The dispatcher uses a **three-source merged profile** (self=0.5 / inferred=0.3 / EMA=0.2) with **time-decayed EMA (τ≈90d)**. Any user-generated content fed to LLMs is wrapped in `<user_content>` delimiters.

**Locked structurally** (from ROADMAP + REQUIREMENTS + Phase 1 — not re-debated):
- New `teammate_inferred_skills` table is additive. `teammates` and `teammate_profiles` schemas never mutate; only additive columns may be added (e.g. `github_mining_consent_at` on `teammate_profiles`, `inference_depth` on `teams`).
- `profileMerge` already reserves the `inferred` parameter (Phase 1 D-06..D-08). Phase 2 only wires the third source — no signature change required.
- All LLM calls route through `chatViaChain` with `temperature: 0` and the team's existing provider chain. New `<user_content>...</user_content>` wrapping helper applied to commit messages and PR bodies before LLM prompts.
- The 6-month window, the 0.5/0.3/0.2 default blend, and τ≈90d are LOCKED by ROADMAP success criteria — they may be made configurable later but the defaults are fixed here.
- Repos that count as "team-connected" = repos registered as projects under the team. Personal repos never mined.

**Carried forward from Phase 1** (D-06..D-08 + post-execution redesign):
- `profileMerge(teammate, profile, inferred, ema)` — drop `inferred` in, no math change.
- D-09 (the disabled "GitHub coming soon" card) was REMOVED during the post-execution redesign. The inferred-skills UI now lives in the right preview rail (see D-26).
- D-10 (team-dropdown nav link) was SUPERSEDED — discovery is the avatar menu → `/teams/me` → `/teams/[id]/me`. No new nav surfaces for Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Consent UX

- **D-21:** **Consent lives inline on `/teams/[id]/me`** — a clearly-labeled section in the form column that explains scope (commits in team-connected repos, 6-month window) and what we don't read (personal repos, content outside commits). Single click triggers GitHub OAuth for the elevated scope. Replaces the visual "GitHub coming soon" slot that D-09 once occupied (which was already removed in the Phase 1 redesign).
- **D-22:** **Revoke = stop mining, keep last-confirmed skills + preserve rejections.** Clicking "Stop mining" disables the worker for this teammate and removes the elevated OAuth scope. Confirmed inferred skills stay in `teammate_inferred_skills` and continue to influence the dispatcher (the user said they're real skills, even if they don't want future scans). Rejected skills stay rejected so a fresh consent later doesn't re-suggest them. New commits no longer get analyzed until re-consent.

### Inference signal mix

- **D-23:** **Multi-signal worker with team-configurable depth** — three levels:
  - **Cheap** (free signals only): GitHub Linguist language stats per repo + file extensions in commits mapped to canonical tags (`.tsx` → `react` + `frontend`, `.py` → `python`, `.vue` → `vue`, `.swift` → `swift`, etc.).
  - **Standard** (default): Cheap + **one LLM batch call per teammate per scan** that reads ~20–40 recent commit message titles and infers practice-level tags ("refactor: auth flow" → `security`; "feat: useState migration" → `react`).
  - **Deep**: Standard + LLM that reads `import` statements from the top ~10 changed files per teammate per scan. Catches concrete tools (e.g. `import { cmd } from 'cmdk'` → `cmdk`, `import { Anthropic } from '@anthropic-ai/sdk'` → `anthropic_api`).
- **Default for new teams:** Standard. Stored on `teams.inference_depth` (`'cheap' | 'standard' | 'deep'`, default `'standard'`). UI to flip is a team-owner-only control in team settings (the planner can fold it into Plan 1's migration or split it out — both are fine).
- **All LLM-bound commit messages / PR bodies / file contents wrapped in `<user_content>...</user_content>`** per ROADMAP success criterion 5 (QUAL-02). New helper function in `src/lib/llm/utils.ts` or `src/lib/prompts.ts`.

### Confirm/reject UX

- **D-24:** **Per-skill toggle, default = accepted.** Newly-inferred skills are immediately active in the dispatcher blend on the next cron cycle. Each skill has a per-pill toggle in the rail. Flipping to "rejected" is **permanent** — that `(teammate_id, canonical_tag)` pair is recorded as rejected and the worker skips emitting it on subsequent scans (matches ROADMAP success criterion 3). No "pending review" intermediate state.
- **Implication:** the dispatcher's `inferred` source feeds confirmed-or-default skills (everything not explicitly rejected). The user-rejected list must be queryable cheaply by the worker on each scan to filter emissions.

### Re-mining cadence + UI placement

- **D-25:** **Weekly cron re-mining** drains every consented teammate. Sits next to the existing `llm_jobs` cron drain. Worker uses the existing `enqueueJob` / `claimNextJob` / `failJob` queue plumbing. PLUS an **on-demand "Re-scan" button** in the inferred-skills section for impatient users (rate-limited to e.g. one scan per teammate per hour to protect the GitHub API quota and our LLM budget).
- **D-26:** **Inferred skills live in the right preview rail as a new "INFERRED FROM GITHUB" section** below "Likely matched to" — header includes last-scan timestamp ("Last scanned 3 days ago") and a Re-scan button. Pills render with per-skill confirm/reject toggles (default-accepted state shows as filled signature-pink, rejected shows muted with strikethrough). When a new scan lands skills not yet seen by the user, a **banner appears on the form column** ("5 new inferred skills — review") with a "Review" CTA that scrolls/jumps to the rail section.

</decisions>

<canonical_refs>
## Canonical Reference Docs

Downstream agents (researcher, planner, executor) MUST read these:

- `.planning/ROADMAP.md` — Phase 2 goal + success criteria (5 items)
- `.planning/REQUIREMENTS.md` — SKILL-01..06, QUAL-02 requirement IDs
- `.planning/phases/01-profile-foundation/01-CONTEXT.md` — Phase 1 decisions D-01..D-20 (especially D-06..D-08 on `profileMerge`)
- `.planning/phases/01-profile-foundation/01-01-SUMMARY.md` — `skillVocabulary` shape that inferred-tag emissions must match
- `.planning/phases/01-profile-foundation/01-02-SUMMARY.md` — `profileMerge` 4-arg signature + interest-nudge semantics
- `.planning/phases/01-profile-foundation/01-03-SUMMARY.md` — `/teams/[id]/me` page structure + `chatViaChain` + `timeoutMs` + `<user_content>` precedent
- `.planning/phases/01-profile-foundation/01-04-SUMMARY.md` — dispatcher wiring pattern (`listProfiles` → `profileMerge` → `rankMatches`)
- `architecture.md` — recgon module table (skillVocabulary, profileMerge, profileStorage, fitLearning, learn, evidenceSources, dispatcher, match)

No external ADRs or specs referenced — Phase 2 is greenfield within the existing planning hierarchy.

</canonical_refs>

<code_context>
## Reusable Code (scouted at discuss time)

The planner can reuse / extend the following — no need to design from scratch:

- **GitHub OAuth + token storage**
  - `src/lib/userStorage.ts`: `githubAccessToken`, `githubUsername`, `socialProfiles` already on `User` row
  - `src/app/api/auth/[...nextauth]/route.ts`: existing NextAuth + GitHub provider
  - `.env.local`: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (or legacy `GITHUB_ID`) already wired
  - **Caveat:** existing scope is `public_repo` (for project repo import). Phase 2 needs `repo` scope to read commit messages across team-connected private repos. A second consent click upgrades scope; old token stays usable for repo listing.

- **Octokit usage pattern**
  - `src/lib/recgon/evidenceSources.ts` `github_commits` source — already uses Octokit-shape for fetching commits. Worker can model on this. Adds the same `narrate(detail)` callback pattern for live UI feedback.

- **EMA primitives**
  - `src/lib/recgon/learn.ts`: `updateScore(prev, rating)` — per-kind EMA with `α=0.30`
  - `src/lib/recgon/fitLearning.ts`: `applySkillRating`, `applySkillRatingsToProfile` — per-skill EMA, currently half-life ≈ 30 days
  - **Adjustment for Phase 2:** add `applyTimeDecay(score, lastSeenAt, now, tau=90d)` function — `score * exp(-Δt/τ)` — and call it at read-time in `profileMerge` (or have the dispatcher fetch the decayed read-view). 90-day τ matches ROADMAP criterion 4.

- **Persistent job queue**
  - `src/lib/llm/jobQueue.ts`: `enqueueJob`, `claimNextJob`, `completeJob`, `failJob` — Phase 2 adds a new kind: `github_skill_inference`. Plays nicely with the existing `/api/cron/llm-jobs` drain.
  - `src/lib/llm/workers.ts`: existing worker dispatch pattern. Add `github_skill_inference` worker alongside the others.

- **profileMerge integration point**
  - `src/lib/recgon/profileMerge.ts` (Phase 1): `profileMerge(teammate, profile, inferred=null, ema)` — drop `inferred` in. The dispatcher wiring (Phase 1 Plan 04) already calls `profileMerge(t, profile, null, t.fitProfile)` per teammate — Phase 2 swaps `null` for the loaded inferred-skills row. Same pattern, no new branches.

- **`/teams/[id]/me` page + right preview rail**
  - `src/app/teams/[id]/me/ProfilePageClient.tsx` — sticky two-column layout
  - `src/app/teams/[id]/me/ProfilePreview.tsx` — right rail card (already has identity + sections + capacity bar + likely matches). Add a new section here for inferred skills.
  - `src/app/teams/[id]/me/ProfileForm.tsx` — controlled form. Add the consent inline section + the "review banner" component.
  - `src/lib/recgon/skillVocabulary.ts` — canonical vocab the worker MUST emit only members of (defense-in-depth filter required just like `skillTagger` does).

- **`<user_content>` wrapping precedent**
  - No existing wrapper helper, but `src/lib/prompts.ts` already uses untrusted-content awareness in places. Plan adds a small `wrapUntrusted(text)` helper.

</code_context>

<scope_creep_log>
## Deferred Ideas

(Captured during discussion; not for Phase 2 — re-evaluate for later phases.)

- **Webhook-based incremental mining** (push events) — D-25 considered but rejected for Phase 2 (registration plumbing + public endpoint = its own milestone). Note for a future "real-time signal" phase.
- **Per-skill-type τ variation** (e.g. security skills decay slower than framework versions) — interesting but ROADMAP locks τ≈90 global. Revisit when there's data showing certain skill types age differently.
- **Modal first-visit prompt for consent** — rejected in D-21 (intrusive). If onboarding metrics show low adoption later, revisit.
- **LLM-driven auto-classification of commit kind** ("this commit is a bugfix vs feature vs refactor") — could feed into matcher fitForKind later. Out of scope for Phase 2 which is skills-only.

</scope_creep_log>

<open_questions_for_planner>
## Notes for Researcher / Planner

- **Plan partition hint:** ROADMAP suggested 4 plans. With the team-config depth (D-23) added, the planner can either fold the `teams.inference_depth` column into Plan 1's migration or split it out. Both reasonable.
- **Default depth on first consent:** `'standard'`. The planner should specify whether the column is `NOT NULL DEFAULT 'standard'` or nullable-fallback.
- **Re-scan rate limit:** suggested 1 scan per teammate per hour (D-25). Stored where? Simplest = a `last_scan_at` column on `teammate_profiles` + a query-time check before enqueuing.
- **Banner unread state tracking:** D-26 requires "show banner when new skills land that user hasn't seen". Simplest = `teammate_inferred_skills.user_reviewed_at` per row; banner shows when `count(rows where user_reviewed_at IS NULL) > 0`. Planner confirms approach.
- **Worker concurrency:** weekly cron drains all consented teammates — for a 50-person team, that's 50 jobs at once. Existing queue handles this; no new concern, just a note that the LLM budget under Standard depth = 50 calls per week per team (or 50×11 if you count Deep + the import-reading pass).
- **What if a teammate has no commits in the 6-month window?** Worker emits no skills + records a `last_scan_at` so the banner doesn't claim "new skills" falsely. Planner confirms empty-result handling.
- **`<user_content>` wrapper:** small helper. Suggest adding to `src/lib/prompts.ts` or `src/lib/llm/utils.ts` — planner picks.

</open_questions_for_planner>
