# Architecture Patterns

**Domain:** LLM-augmented AI Product Manager / task dispatcher (Recgon v2)
**Researched:** 2026-05-11
**Mode:** Project research — architecture dimension
**Confidence:** HIGH (grounded in existing codebase maps)

## Design Principles (Recgon-specific)

1. **Math is the spine; LLM is the overlay.** The deterministic `match.ts` score must remain the source of truth and the fallback path. Every LLM addition is an *augmentation* that can fail silently to math.
2. **Additive, not replacing.** New tables/columns sit alongside `agent_tasks` / `agent_teammates`; no destructive migrations.
3. **Heavy work goes through `llm_jobs`.** Anything > ~3s or that calls an LLM more than once must enqueue, not block the dispatcher tick.
4. **Single source of truth for prompts (`prompts.ts`) and schemas (`schemas.ts`).** Every new LLM call gets a named prompt builder + a Zod schema, no inlining.
5. **Audit everything the LLM decides.** Math score + LLM reasoning must both persist so the team can see *why* a task landed on them.

## Recommended v2 Architecture

### Component Map (new vs existing)

| Component | File | Status | Responsibility |
|-----------|------|--------|---------------|
| `brain.ts` | `src/lib/recgon/brain.ts` | Modified | Aggregates inputs, now also reads `liveCodeSignal()` |
| `liveCode.ts` | `src/lib/recgon/liveCode.ts` | **NEW** | Incremental codebase analyzer; emits `LiveCodeDelta[]` |
| `taskMint.ts` | `src/lib/recgon/taskMint.ts` | Unchanged | Idempotent task creation |
| `match.ts` | `src/lib/recgon/match.ts` | Unchanged | Deterministic Jaccard + EMA scoring |
| `judge.ts` | `src/lib/recgon/judge.ts` | **NEW** | LLM judgment overlay over top-N math candidates |
| `dispatcher.ts` | `src/lib/recgon/dispatcher.ts` | Modified | Calls `judge.tryJudge()` after `rankMatches()`; falls back to math winner on error |
| `reframe.ts` | `src/lib/recgon/reframe.ts` | **NEW** | Generates personalized task description per assignee |
| `skillTagger.ts` | `src/lib/recgon/skillTagger.ts` | Unchanged | Task → skills |
| `githubSkills.ts` | `src/lib/recgon/githubSkills.ts` | **NEW** | Teammate GitHub history → inferred skill profile |
| `profileMerge.ts` | `src/lib/recgon/profileMerge.ts` | **NEW** | Merges self-declared + GitHub-inferred + EMA into effective skill profile at dispatch time |
| `fitLearning.ts` | `src/lib/recgon/fitLearning.ts` | Unchanged | EMA updates from rated outcomes |
| Profile UI | `src/app/teams/[id]/me/page.tsx` | **NEW** | Self-declared teammate profile + "what GitHub says" view |
| Workers | `src/lib/llm/workers.ts` | Modified | New kinds: `live_code_summary`, `github_skill_inference`, `task_reframe` |

### Boundary Discipline

- `judge.ts`, `reframe.ts`, `githubSkills.ts`, `liveCode.ts` are **pure libraries** — they accept inputs, call `chatViaChain`, return parsed objects. They never write to DB. Persistence stays in `storage.ts`.
- `dispatcher.ts` remains the only orchestrator. It calls these libs in sequence and decides what to persist.
- `profileMerge.ts` is computed *at dispatch time*, not stored. The three skill sources stay in their own columns / tables; the merge is a pure function. This avoids "which source is canonical?" ambiguity.

## Data Flow (v2 pipeline)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Triggers                                                                 │
│  • POST /api/teams/[id]/recgon/dispatch  (manual)                         │
│  • GET  /api/cron/recgon-schedule        (daily 06:00 UTC)                │
│  • GitHub webhook (optional, v2.x)       → enqueues live_code_summary job │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  runDispatch(teamId)                                                      │
│                                                                           │
│  1. readUnifiedBrain(teamId)                                              │
│     ├─ existing: next steps + GA4 drift + GitHub diffs                    │
│     └─ NEW: liveCodeSignal(teamId)                                        │
│            └─ reads cached `project_file_summaries` (filtered to files    │
│               touched since last run); falls back to stale analysis      │
│                                                                           │
│  2. mintTasksFromBrain()             (unchanged, idempotent)              │
│                                                                           │
│  3. ensureFreshSkills()              (unchanged)                          │
│                                                                           │
│  4. loadTeammatesWithEffectiveProfile(teamId)                             │
│         └─ NEW: profileMerge() blends                                     │
│              ├─ teammate_profiles.self_declared_skills                    │
│              ├─ teammate_inferred_skills.github_skills                    │
│              └─ agent_teammates.fitProfile.skillStats (EMA)               │
│                                                                           │
│  5. For each unassigned task:                                             │
│     a. rankMatches() → ordered candidates with math scores                │
│     b. If top score ≥ 0.4 AND |top1 - top2| < threshold:                  │
│           judge.tryJudge({task, topN: 3, context})                        │
│            ├─ HIT  → use LLM winner + persist reasoning                   │
│            └─ MISS → use math winner                                      │
│        Else: use math winner (no LLM cost on lopsided matches)            │
│     c. assignTask() + setTaskSchedule()                                   │
│     d. enqueue('task_reframe', {taskId, assigneeId})                      │
│     e. Write audit log: math breakdown + LLM reasoning (if any)           │
│                                                                           │
│  6. notifyTeammateAssigned() reads `tasks.personalized_description`       │
│     (populated by reframe worker, falls back to original)                 │
└───────────────────────────────────────────────────────────────────────────┘

           ┌──────────────────────────┐    ┌──────────────────────────┐
           │ Background (llm_jobs)    │    │ On-demand                │
           │                          │    │                          │
           │ • live_code_summary      │    │ • Profile UI:             │
           │   per-file → cache       │    │   POST /api/teams/[id]/   │
           │ • github_skill_inference │    │     me  (server action)   │
           │   per-teammate, weekly   │    │ • Re-run GitHub inference │
           │ • task_reframe           │    │   button in profile UI    │
           │   per-assignment         │    │                          │
           └──────────────────────────┘    └──────────────────────────┘
```

## Answers to Specific Questions

### 1. Where does LLM judgment slot in?

**Decision:** New file `src/lib/recgon/judge.ts`. Called from `dispatcher.ts` *after* `rankMatches()`, *before* `assignTask()`.

**Fallback strategy:**
- Wrap the call in try/catch around `chatViaChain` (which already integrates the circuit breaker).
- On any throw, log and use math winner. **No `await` in a critical path without a `catch`.**
- Pattern mirrors existing `verify.ts` / `evidenceRouter.ts` — they already do this correctly.

**Top-N selection:**
- Pre-filter to **top 3** candidates from math. Rationale:
  - Top 1 alone gives the LLM nothing to do.
  - Top 5+ inflates the prompt (each candidate carries name, skills, EMA, current load, recent tasks → ~150 tokens each).
  - 3 is the smallest set that captures "close calls" while keeping the prompt under ~2k tokens.
- **Cost guard:** skip LLM entirely when `score[0] - score[1] > 0.15` (lopsided). Estimated to eliminate ~50% of judge calls.
- **One LLM call per task**, not per candidate. Prompt: "Given task X, choose between A/B/C with reasoning." Output: `{ chosen_id, reason, soft_factors_used[] }`.

**Schema:** add `JudgeResultSchema` to `schemas.ts`. Prompt: `JUDGE_ASSIGNMENT_SYSTEM` + `judgeAssignmentUserPrompt()` in `prompts.ts`.

### 2. Live codebase analyzer — incremental architecture

**Where it plugs in:** `brain.ts` calls a new `liveCodeSignal(teamId)` that *augments* (does not replace) the existing `prioritizedNextSteps` source. Both flow into `BrainEntry[]`. The stale `project_analyses.analysis` blob stays as a fallback / coarse signal.

**File-change detection (recommended path):**
- **Polling via GitHub API**, not webhooks (avoids new endpoint + secret rotation + Vercel webhook latency).
- For each project with a GitHub repo: compare `lastAnalyzedSha` (stored on project row) to current `HEAD`. Use `git diff --name-only` semantics via `GET /repos/{owner}/{repo}/compare/{base}...{head}`.
- Cap: max **20 files per project per run**. Larger diffs flag as "needs full re-analysis" and enqueue a `codebase_analysis` job instead.
- `simple-git` is rejected: requires a checked-out repo, which doesn't fit Vercel's ephemeral filesystem.

**Storage:** **NEW table `project_file_summaries`**:
```
project_file_summaries (
  id uuid pk,
  project_id uuid fk,
  team_id uuid fk,
  file_path text,
  file_sha text,
  summary text,            -- ~200-token LLM summary of file purpose/changes
  signals jsonb,           -- {category: 'auth'|'ui'|'api'|..., risks: [], opportunities: []}
  summarized_at timestamptz,
  unique(project_id, file_path, file_sha)
)
```
Reusing `project_analyses` rows would conflate "full analysis" with "per-file deltas" — keep them separate.

**Cost guards:**
- Skip files < 30 lines (rename/move/whitespace).
- Skip non-source extensions (`.lock`, `.svg`, `.png`, `dist/`, `build/`, `.next/`).
- Per-team daily cap on summaries: 100 files. Overflow → next run.
- Job kind: `live_code_summary` enqueued through existing `llm_jobs` queue; drained by existing cron. **No new cron needed.**

### 3. GitHub skill inference

**When it runs:**
- **On teammate creation:** one-shot enqueue when a user joins a team and has a linked GitHub account.
- **On-demand:** "Re-analyze my GitHub" button in the profile UI (rate-limited to once per 24h per user).
- **Weekly cron:** piggyback on `recgon-schedule` daily tick — only run for teammates whose `github_skills_refreshed_at` is older than 7 days.
- **No real-time / per-commit recomputation** — too expensive, low value.

**Output shape:** **NEW table `teammate_inferred_skills`**, NOT direct mutation of `agent_teammates.skills`. Rationale:
- Preserves the three-source layering (self / inferred / EMA).
- Lets the teammate see + override what was inferred without losing self-declared data.
- Makes the merge auditable.

```
teammate_inferred_skills (
  teammate_id uuid pk fk,
  team_id uuid fk,
  github_skills jsonb,         -- {typescript: 0.8, react: 0.7, postgres: 0.5}
  evidence jsonb,              -- {languages: {...}, top_dirs: [...], pr_count: 42}
  refreshed_at timestamptz,
  user_overrides jsonb         -- {skill_name: 'rejected'|'manual_value'}
)
```

`profileMerge.ts` reads all three sources and computes effective skill profile at dispatch time. Self-declared > inferred > EMA, with weights (e.g. 0.5/0.3/0.2) tunable per team later.

**Privacy / staleness:**
- Profile UI shows "GitHub says you know: TypeScript, React, Postgres — [confirm] [reject] [edit]."
- Rejected skills go into `user_overrides` and are excluded from merge.
- "Last analyzed: 6 days ago" indicator with re-run button.

### 4. Personalized framing

**Where it lives:** New file `src/lib/recgon/reframe.ts`. **Queued through `llm_jobs`** as kind `task_reframe`, not inline. Rationale:
- Dispatcher runs in a 60s window; reframing N tasks × ~3s each could blow the budget.
- Reframing is non-blocking — the assignment notification can ship with the original description if reframe hasn't completed yet. Worker writes back when done; client refetches.
- Failed reframes don't block assignments.

**Storage:** **add column `personalized_description text` to `agent_tasks`**, plus `personalized_description_for_user_id uuid` (so reassignment invalidates it cleanly). No new table needed — it's 1:1 with the active assignment.

**Regeneration triggers:**
- On reassignment (different user_id) → enqueue new reframe, clear old.
- On task edit (title/description changed) → enqueue new reframe.
- NOT on every dispatcher tick (would burn cost for no reason).

### 5. Self-profile UI — Next.js wiring

**Location:** `src/app/teams/[id]/me/page.tsx` (per-user, scoped to current team). Rationale:
- Profiles are team-scoped (a person can have different skills declared per team they're in — designer at startup A, dev at startup B).
- `/account/profile` would be user-global and mismatch the team-scoped data model.
- Lives next to existing `src/app/teams/[id]/` routes.

**Data shape:** **NEW table `teammate_profiles`**, not a column on `agent_teammates`. Rationale:
- `agent_teammates` already holds dispatcher state (`skills`, `fitProfile`, `capacityHours`) that the dispatcher mutates.
- `teammate_profiles` holds *user-authored* state (`self_declared_skills`, `strengths`, `interests`, `weekly_capacity_hours_override`, `bio`).
- Clean separation: dispatcher-write vs user-write.

```
teammate_profiles (
  id uuid pk,
  teammate_id uuid fk,
  team_id uuid fk,
  self_declared_skills jsonb,      -- ['typescript', 'design', 'copywriting']
  strengths text,
  interests text,
  weekly_capacity_hours int,
  updated_at timestamptz,
  unique(teammate_id, team_id)
)
```

**Form handling:** **Server actions**, not API routes. Rationale:
- Single-form mutation; no need for cross-client API surface.
- Follows Next 15 App Router convention.
- Server action calls `teamStorage`-style helper in a new `src/lib/recgon/profileStorage.ts`.

UI sections:
1. **Self-declared:** editable skills tag input, strengths textarea, interests textarea, capacity hours slider.
2. **What GitHub says:** read-only view of `teammate_inferred_skills.github_skills`, with [confirm] / [reject] toggles per skill, "re-analyze" button.
3. **What Recgon has learned:** read-only view of top EMA scores from `fitProfile.skillStats` ("Recgon thinks you're great at React based on 4 completed tasks").

### 6. Build order (single dev, ship value early)

```
Phase A: Foundation (no LLM cost added)
├─ A1. profileMerge.ts (pure function, with unit tests)
└─ A2. Self-profile UI + teammate_profiles table + server action
       └─ VALUE: Teammates can self-declare today. Dispatcher already reads
                 skills array; just point profileMerge at it. Shippable alone.

Phase B: GitHub skill inference
├─ B1. teammate_inferred_skills table + githubSkills.ts + job kind
├─ B2. "What GitHub says" section in profile UI
└─ B3. Wire profileMerge to include inferred skills
       └─ VALUE: Cold-start problem solved. Even teammates who skip the profile
                 page get reasonable skill seeding.

Phase C: LLM judgment overlay
├─ C1. judge.ts + prompt + schema + JUDGE_ASSIGNMENT_* in prompts.ts
├─ C2. dispatcher.ts integration with try/catch fallback
└─ C3. Audit log column on agent_tasks (assignment_reasoning jsonb)
       └─ VALUE: Better assignments on close calls. No new infra. Fully
                 fail-safe — turning it off restores math-only behavior.

Phase D: Personalized framing
├─ D1. reframe.ts + task_reframe worker + personalized_description column
├─ D2. Notification + task detail UI reads personalized when present
└─ D3. Regeneration hooks (reassignment, edit)
       └─ VALUE: The "manager-feeling" UX win. Visible to every user immediately.

Phase E: Live code signal (largest, save for last)
├─ E1. project_file_summaries table + live_code_summary worker
├─ E2. liveCode.ts: diff fetch, file filter, cache lookup
├─ E3. brain.ts integration
└─ E4. Daily cron piggyback + cost guard tuning
       └─ VALUE: Brain understands what just changed in code. Highest LLM
                 cost per project; ship after we've validated the rest.
```

**Dependency reasoning:**
- A blocks B, C, D, E (profileMerge is read by everyone, so it must exist with at least the self-declared source).
- B is independent of C/D/E but should ship before C to give the judge richer skill data.
- C and D are independent of each other; C is "smarter assignment," D is "better delivery." Either could ship first; C first because it changes *who* gets the task (higher-impact metric).
- E is the riskiest (new table, new worker, GitHub API quota concerns, file-size cost variance). Ship last when the rest is stable.

### 7. LLM Fallback Strategy per New Component

| Component | LLM Call | Failure Mode | Fallback |
|-----------|----------|--------------|----------|
| `judge.ts` | One `chatViaChain` per task | Throw / timeout / parse error | Math winner from `rankMatches()`; log `judge_skipped` reason |
| `reframe.ts` | One `chatViaChain` per assignment, in worker | Worker exception | Job retries via `llm_jobs` backoff; user sees original description until success |
| `liveCode.ts` summarizer | One `chatViaChain` per file, in worker | Worker exception | Skip file, retry on next run; brain falls back to stale `project_analyses.analysis` |
| `githubSkills.ts` | One `chatViaChain` per teammate (in worker) | Worker exception | Skip; profileMerge omits the `inferred` source; self-declared + EMA still work |

All four use the existing `chatViaChain` → circuit breaker → Gemini → Claude → retry/timeout chain. **No new resilience infra needed.**

## Storage Schema Additions (Summary)

| Table / Column | Type | Owner | Purpose |
|----------------|------|-------|---------|
| `teammate_profiles` (NEW table) | jsonb-heavy | user | Self-declared skills, strengths, interests, capacity |
| `teammate_inferred_skills` (NEW table) | jsonb-heavy | github worker | GitHub-derived skills + evidence + user overrides |
| `project_file_summaries` (NEW table) | jsonb-heavy | live-code worker | Per-file incremental analysis cache |
| `agent_tasks.personalized_description` | text | reframe worker | Per-assignee task framing |
| `agent_tasks.personalized_description_for_user_id` | uuid | reframe worker | Invalidation key on reassignment |
| `agent_tasks.assignment_reasoning` | jsonb | dispatcher | Math breakdown + LLM judge reasoning (audit) |
| `projects.last_analyzed_sha` | text | live-code worker | Diff baseline for incremental analyzer |
| New `JobKind` values | enum | llm_jobs | `live_code_summary`, `github_skill_inference`, `task_reframe` |

Migration plan: 4 forward-only migrations under `supabase/migrations/`, one per phase. All additive; no destructive changes to existing tables.

## Cost / Perf Guardrails (Summary)

| Guard | Bound |
|-------|-------|
| Judge LLM call | Only when top-2 math scores within 0.15; max 1 call per unassigned task per dispatch |
| Live code summaries | Max 20 files / project / run, files < 30 lines skipped, daily cap 100 / team |
| GitHub skill inference | Once per teammate per 7 days (cron) or once per 24h (manual) |
| Task reframe | Skipped on dispatcher-only retries; regenerated only on reassignment or edit |
| All workers | Already share `llm_jobs` exponential backoff + dead-letter |
| Circuit breaker | Already prevents cascading LLM failure across all four new components |

## Anti-Patterns to Avoid

### Replacing math instead of overlaying it
**What:** Letting the LLM make the final decision without math gating.
**Why bad:** Unpredictable cost, no fallback, regression in fairness math the team already trusts.
**Instead:** Math always runs; LLM only votes on close calls; assignment_reasoning logs both.

### Inline LLM calls inside `dispatcher.ts` for reframing
**What:** Awaiting reframe in the dispatch loop.
**Why bad:** Blows Vercel timeout when there are many assignments; one slow LLM call holds up everything else.
**Instead:** Enqueue reframe; dispatcher only handles assignment.

### Mutating `agent_teammates.skills[]` from GitHub inference
**What:** Overwriting user-curated data with auto-inferred data.
**Why bad:** Destroys the self-declared signal; teammates lose trust when "Recgon says I know X" overwrites their own input.
**Instead:** Three separate sources, merged at read time.

### One giant `project_file_summaries.summary` blob per project
**What:** Storing all file summaries in a single row.
**Why bad:** Race conditions on update, can't selectively invalidate, expensive to read for small queries.
**Instead:** One row per `(project_id, file_path, file_sha)`, unique constraint enforces idempotency.

### Trusting the LLM judge output without schema validation
**What:** Using raw model text to pick an assignee.
**Why bad:** Hallucinated user IDs, malformed reasoning, possible prompt injection from task content.
**Instead:** `JudgeResultSchema` validates `chosen_id` is in the candidate set; reject + fallback to math on parse failure.

## Sources

- `.planning/PROJECT.md` — milestone scope + constraints (HIGH)
- `.planning/codebase/ARCHITECTURE.md` — existing dispatcher pipeline (HIGH)
- `.planning/codebase/STRUCTURE.md` — file layout + add-here patterns (HIGH)
- `.planning/codebase/STACK.md` — Vercel runtime + LLM chain constraints (HIGH)
- `.planning/codebase/CONVENTIONS.md` — prompt/schema rules + LLM patterns (HIGH)
- Existing `src/lib/recgon/verify.ts` + `evidenceRouter.ts` — proven LLM-overlay + try/catch pattern this design copies (HIGH)
- Existing `src/lib/llm/jobQueue.ts` + `workers.ts` — proven persistent-work pattern this design extends (HIGH)

---
*Architecture research: 2026-05-11*
