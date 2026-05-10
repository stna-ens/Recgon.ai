# Phase 1: Profile Foundation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A teammate can self-declare **skills, strengths, interests, and weekly capacity hours** at `/teams/[id]/me`, and the dispatcher uses that data on the very next cron cycle through a new pure `profileMerge` read-path.

**Locked structurally** (from ROADMAP + REQUIREMENTS — not re-debated):
- New `teammate_profiles` table is additive — `teammates` table schema never mutates.
- All dispatcher reads go through `profileMerge(self, inferred=null, ema)` so Phase 2 slots in without touching Phase 1 code.
- Skill picker and `skillTagger` share a single canonical vocabulary extracted into `src/lib/recgon/skillVocabulary.ts` (the existing vocab is inlined in `src/lib/prompts.ts` lines 887–921 — must be extracted in this phase).
- Any new LLM call (only one expected — see D-12 below) routes through `chatViaChain` with `temperature: 0`.

</domain>

<decisions>
## Implementation Decisions

### Form fields and how each one counts

- **D-01:** The profile form has four fields: `skills`, `weeklyCapacityHours`, `strengths`, `interests`.
- **D-02:** **Strengths are treated as additional skill tags** — they get folded into the same skill array that the existing 45%-weighted Jaccard overlap in `match.ts` consumes. No math change required; strengths simply extend the input array.
- **D-03:** **Interests are a separate light tiebreaker** — a small bonus applied when a task's tags overlap with the teammate's declared interests. Sized to break ties between similar candidates, not override genuine skill differences. Concrete weight TBD in plan phase; suggested starting point ≤ 0.05 of total fit score.
- **D-04:** All four fields belong to the same `teammate_profiles` row keyed by `(team_id, user_id)`.

### Owner-typed vs self-declared data (additive layering)

- **D-05:** The owner's existing `teammates` row stays untouched on profile save. There is **no mutation** of `teammates.skills`, `teammates.capacity_hours`, or any other existing column.
- **D-06:** `profileMerge` policy: **self wins when filled; owner's row fills the blanks.** A blank field in `teammate_profiles` means "I haven't said anything" → fall back to the owner's value, NOT "I want zero".
- **D-07:** This makes the merge field-level, not row-level. A teammate who fills only skills and leaves capacity blank gets `{skills: self, capacityHours: owner, strengths: [], interests: []}`.
- **D-08:** When a teammate has no `teammate_profiles` row at all, `profileMerge` returns the owner's `teammates` row unchanged — Phase 1 must be backwards-compatible with teams that haven't adopted profiles yet.

### Profile page surface (`/teams/[id]/me`)

- **D-09:** The page shows the form **plus a clearly-disabled section labeled "What GitHub will say about you — coming soon"** as a Phase 2 placeholder. This sets user expectation and prevents the layout from shifting underneath them when Phase 2 lights it up. Greyed-out + disabled state, no fake data.
- **D-10:** Discovery: **nav link in the team menu only.** No nag-banner on the dashboard, no first-login redirect. Quieter UX; relies on owner manually nudging teammates to fill it out when the feature ships.
- **D-11:** The page does NOT show a "tasks you've been doing lately" panel or "AI sees you as X" summary in Phase 1 — keep the page minimal.

### Skill picker UX (LinkedIn-style suggestion pills + AI normalization)

- **D-12:** **Free-text input with suggestion pills.** Teammate types naturally ("PostgreSQL", "TikTok ads"); as they type, suggestion chips matching canonical vocab + popular free-text patterns appear below the input. Clicking a suggestion adds it as a removable pill. The form sends raw text to the server on save.
- **D-13:** **One LLM normalization call on save** routes raw free-text entries through the existing `chatViaChain` (Gemini → Claude) at `temperature: 0` to map each entry to canonical tags. This is the only new LLM call in Phase 1.
- **D-14:** The `teammate_profiles` row stores **both**: the teammate's raw typed words AND the canonical tags the AI matched them to. The dispatcher math uses only canonical tags. The profile UI displays both: `PostgreSQL (matched as: backend)` — so teammates see how Recgon is reading them.
- **D-15:** Canonical-only vocab (option strict-list) was rejected — too constraining. Pure free-text end-to-end was rejected — too expensive at dispatch time and breaks the explainability requirement in PROJECT.md.
- **D-16:** Built on top of the existing `cmdk` library (locked by ROADMAP plans hint), styled as removable pill chips.

### Profile visibility (team-level toggle, owner-controlled)

- **D-17:** A new team-level setting `profile_visibility` controls whether teammates can see each other's profiles. Two values: `team_visible` (default) and `owner_only`.
- **D-18:** Default for new teams: `team_visible` — collaborative posture. The owner can flip it to `owner_only` from team settings.
- **D-19:** The owner ALWAYS sees every teammate's profile, regardless of setting. A teammate ALWAYS sees their own profile.
- **D-20:** Fit scores (numerical ratings of each teammate by the dispatcher) remain private regardless of this setting — PROJECT.md Out-of-Scope is unchanged.

### Voice and design (UI guardrails)

- **D-21:** **Recgon IS the AI Product Manager — not an app with AI inside it.** UI copy on this page must speak as Recgon, never about Recgon. No "Powered by AI" labels, no third-person "the AI thinks...", no robot emojis. Copy should feel like an onboarding form a smart manager hands you.
- **D-22:** The page must match the existing app design language: glass-card surface, signature pink accent (light: `#c2357a` / dark: `#f0b8d0`), JetBrains Mono for labels/metadata, Inter for body. No alien aesthetics, no stacked glass effects — inherit the existing `.glass-card` + cursor-lensing patterns.
- **D-23:** Frontend skills available for the plan/execute phases: `impeccable`, `high-end-visual-design`, `design-taste-frontend`, `frontend-design`, `shadcn`, `vercel-react-best-practices`. Use whichever fit the work, but defer to existing design tokens before introducing anything new.

### Claude's Discretion

- **profileMerge weight ratios for Phase 1 (self vs EMA, no inferred yet).** Roadmap flags this for in-plan simulation against historical `agent_tasks` data — not a CONTEXT-level decision. Planner should propose a starting weight (e.g. self = 0.71, EMA = 0.29 — renormalized from the three-source ratios with inferred=0), simulate, and document.
- **Interest-nudge weight.** D-03 mandates a small bonus; planner picks the exact numeric weight after simulating against the existing fit-score distribution.
- **`teammate_profiles` schema details.** Column types, indexes, constraints — planner's call, following existing migration patterns in `supabase/migrations/`.
- **Suggestion chip ranking algorithm.** D-12 calls for suggestions as the teammate types; planner picks the matching strategy (prefix match against canonical, fuzzy match, recent-free-text-by-others-in-team, etc.).
- **Where the "matched as: backend" annotation renders.** Planner decides whether it's an inline subscript, a tooltip on hover, or a separate "AI sees these as" line — as long as the raw + canonical mapping is visible to the teammate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning artifacts
- `.planning/ROADMAP.md` §Phase 1 — Phase goal, success criteria, plans hint
- `.planning/REQUIREMENTS.md` §Profile (Phase A) — PROFILE-01..06 + QUAL-05/06 locked requirements
- `.planning/PROJECT.md` — Constraints, Key Decisions, Out-of-Scope (esp. "Public fit-score leaderboards / gamification" and "Vector store / embedding store")
- `.planning/STATE.md` — Current position; open research flags
- `.planning/research/SUMMARY.md` §Canonical Build Order + §Open Questions — Build order rationale, profileMerge weight-ratio research flag

### Codebase maps (read before touching `src/lib/recgon/`)
- `.planning/codebase/ARCHITECTURE.md` — Where Phase 1 lands in the dispatcher stack
- `.planning/codebase/CONVENTIONS.md` — Code style, prompts-in-one-file rule, schemas-in-one-file rule
- `.planning/codebase/STRUCTURE.md` — Directory layout for new files
- `.planning/codebase/STACK.md` — Locked tech choices (Next 15, Supabase, NextAuth v5, Tailwind, Radix)

### Existing source files Phase 1 directly touches or copies patterns from
- `src/lib/recgon/types.ts` — Existing `Teammate` / `FitProfile` / `SkillStat` types (new `TeammateProfile` type lands here)
- `src/lib/recgon/match.ts` — Existing fit-score math (must NOT change in Phase 1; profileMerge feeds it)
- `src/lib/recgon/skillTagger.ts` — Existing skill tagger that uses the canonical vocab inline (extracts to `skillVocabulary.ts` in this phase)
- `src/lib/recgon/storage.ts` lines 160–296 — `teammates` table CRUD (pattern for new `profileStorage.ts`)
- `src/lib/recgon/dispatcher.ts` — Where `profileMerge` gets wired in
- `src/lib/prompts.ts` lines 887–921 — Current location of the canonical vocab (to be extracted)
- `src/lib/llm/providers.ts` — `chatViaChain` for the one new LLM normalization call
- `src/lib/schemas.ts` — Pattern for the new normalization-output Zod schema
- `src/app/teams/[id]/page.tsx` — Existing team page (sibling route to new `/teams/[id]/me`)
- `src/components/TeamProvider.tsx` — Team context for the new `/me` page

### Design / UI references
- Memory: "Design system constraint" — glass-card, recgon-label, JetBrains Mono, signature pink only
- Memory: "Signature pink light mode" — light = `#c2357a`, dark = `#f0b8d0`
- Memory: "Glass treatment" — inherit `.glass-card` + cursor lensing, don't stack glass effects
- Memory: "Landing redesign" — current 2026-05-10 aesthetic to inherit

### Migration patterns
- `supabase/migrations/20260505_remove_ai_teammates.sql` — Recent additive migration pattern
- `supabase/migrations/20260428_project_integrations.sql` — Recent additive-table example

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`teammates` table + `Teammate` type** (`src/lib/recgon/storage.ts` + `types.ts`): the row already carries `skills`, `capacity_hours`, `working_hours`, `title`. Profile augments — never replaces.
- **`chatViaChain` / `chatViaProviders`** (`src/lib/llm/providers.ts`): the one new LLM call for skill normalization on save routes here. No new provider work required.
- **Existing canonical vocab in `prompts.ts` (lines 887–921)**: 30+ canonical tags already battle-tested by the task tagger. Phase 1 extracts these verbatim into `skillVocabulary.ts` — no re-curation needed.
- **`cmdk` library** (already in `package.json` per ROADMAP plans hint): powers the LinkedIn-style suggestion picker.
- **`prompts.ts` + `schemas.ts` pattern**: new prompt for skill normalization lands in `prompts.ts`; new Zod schema (`SkillNormalizationResultSchema`) lands in `schemas.ts`. Hard rule — never inline.
- **Glass-card design system** (`src/app/globals.css` + `src/components/`): `.glass-card`, `.recgon-label`, signature pink CSS vars, JetBrains Mono. The new page inherits these directly.

### Established Patterns
- **Team-scoped storage**: every storage call takes `teamId` + verifies access. New `profileStorage.ts` must follow the same pattern (`verifyTeamAccess` before any read/write).
- **Server-only Supabase**: `teammate_profiles` access goes through `src/lib/supabase.ts` service-role client. The profile page UI submits to a server action / API route — never imports Supabase client-side.
- **Prompts-in-one-file / schemas-in-one-file**: hard rule across the codebase. Skill normalization prompt → `prompts.ts`. Output schema → `schemas.ts`.
- **Additive migrations**: every recent migration is additive (new tables, new columns, never destructive). Phase 1 follows.
- **Pure functions in `src/lib/recgon/`**: `match.ts`, `scheduler.ts` are pure. `profileMerge.ts` follows — pure function, dependency-injected, unit-testable.
- **`chatViaChain` + `temperature: 0` + zod schema** for all new LLM calls (QUAL-05/06). The normalization call follows this exact pattern.

### Integration Points
- **`dispatcher.ts`** — `profileMerge(teammate, profile, inferred=null, ema)` gets called inside the dispatcher's teammate-resolution step, before `match.ts` runs. This is the only behavioral change in existing code paths.
- **`match.ts`** — UNCHANGED in Phase 1. It receives a merged `Teammate` object as it always did; consumer doesn't know the data came from `profileMerge`. The interest-nudge bonus (D-03) is implemented INSIDE `match.ts` as a small additive term — that's the only allowed math touch.
- **`/teams/[id]/page.tsx`** — Existing team page gains a "My Profile" nav link to `/teams/[id]/me`. No other team page changes.
- **`team` table or `team_settings`** — Needs a new column for `profile_visibility` (`team_visible` | `owner_only`). Planner decides whether to extend `teams` directly or use a new `team_settings` table.

</code_context>

<specifics>
## Specific Ideas

- **LinkedIn-style suggestion pills.** User's reference: as you type, suggestion chips appear below the input; clicking adds a removable pill; multi-select via repeated picks. This is the target interaction model, not a stretch goal.
- **"PostgreSQL (matched as: backend)"** — the user wants visible AI translation, not hidden. Teammates should see what the AI did with their input.
- **Recgon-as-AI voice.** Copy on the page should sound like Recgon is the manager onboarding you, not an app showing you an AI feature. No "AI-powered" labels.
- **"What GitHub will say about you — coming soon"** placeholder is real UI, not a comment in the code. Greyed out, clearly disabled, sets the expectation for Phase 2.

</specifics>

<deferred>
## Deferred Ideas

- **Showing "tasks you've been doing lately" / "your average rating" on the profile page** — considered, deferred to keep Phase 1 minimal. Belongs in a future polish phase or as part of Phase 4 (personalized framing) which already covers per-assignee context.
- **First-login auto-redirect to profile** — rejected as too heavy-handed. Could be reconsidered as part of a teammate-onboarding milestone, but explicitly out for Phase 1.
- **Nag-banner on dashboard for incomplete profiles** — rejected for Phase 1. The user accepts manually nudging teammates (Slack / email) when the feature ships. Could revisit if adoption is poor.
- **Pure free-text end-to-end (no canonical vocab)** — rejected for v3. Would require LLM calls inside the dispatcher hot path, breaking cost + predictability + explainability constraints in PROJECT.md. Belongs in a future v4-or-later redesign.
- **Stretch / learning tasks** — STRETCH-01 already deferred in REQUIREMENTS.md. Interests COULD eventually power stretch-task surfacing (interest > skill = grow-into task), but not in Phase 1.
- **Owner-edits-teammate-profile UI** — currently the owner edits the `teammates` row via existing team settings; the new self-declared profile is teammate-edited only. If owners want to seed a profile on behalf of a teammate, that's a future enhancement.

</deferred>

---

*Phase: 1-Profile Foundation*
*Context gathered: 2026-05-11*
