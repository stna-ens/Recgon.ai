# Requirements: Recgon — Smarter AI Product Manager v3

**Defined:** 2026-05-11
**Core Value:** The right task gets to the right teammate at the right time, with reasoning the teammate can trust.

> **Naming note:** This milestone is the **Smarter Dispatcher v3** upgrade. Pre-existing Recgon capabilities (today's product) are captured as **Validated** in `PROJECT.md` and remain untouched. Each phase of v3 is purely additive on top of that foundation.

## Milestone Requirements (Smarter Dispatcher v3)

Each requirement maps to one of the canonical phases A → E from `.planning/research/SUMMARY.md`.

### Profile (Phase A — Self-declared foundation)

- [ ] **PROFILE-01**: A teammate can fill in their own profile (skills, strengths, interests, weekly capacity hours) from a per-team page at `/teams/[id]/me`.
- [ ] **PROFILE-02**: The skill picker uses a single canonical vocabulary (from `skillVocabulary.ts`) shared with the existing `skillTagger` so task `requiredSkills` and teammate `skills` use the same labels.
- [ ] **PROFILE-03**: Self-declared profile data is stored in a new `teammate_profiles` table (separate from `agent_teammates`), additive, never overwrites existing fields.
- [x] **PROFILE-04**: The dispatcher reads from a `profileMerge` pure function that combines self-declared + (eventually) GitHub-inferred + EMA history at dispatch time — no schema mutation on the existing `agent_teammates` table.
- [x] **PROFILE-05**: A teammate can update their profile at any time; subsequent dispatcher runs respect the new values within one cron cycle.
- [x] **PROFILE-06**: Capacity hours declared in the profile feed into the existing load-headroom math in `match.ts` without changing the math itself.

### Skill Inference (Phase B — GitHub signal)

- [x] **SKILL-01**: A teammate can grant explicit consent to GitHub commit-history mining from their profile page. Consent is required before any mining runs; consent timestamp is stored.
- [ ] **SKILL-02**: A new `github_skill_inference` job kind mines a teammate's commits in the team's connected repos only (never personal repos), within a rolling 6-month window.
- [x] **SKILL-03**: Inferred skills (language stats, file-path patterns, PR review patterns) are stored in a new `teammate_inferred_skills` table, separate from self-declared profile.
- [ ] **SKILL-04**: The `profileMerge` function blends three sources (self-declared 0.5 / GitHub-inferred 0.3 / EMA history 0.2 — initial weights, tunable) without overwriting any source.
- [x] **SKILL-05**: A teammate can see "what GitHub says about you" in the profile UI and confirm or reject each inferred skill. Rejected skills are excluded from `profileMerge`.
- [ ] **SKILL-06**: Skill EMA in `fitLearning.ts` adds a time-decay factor (`exp(-Δt/τ)` with τ≈90 days) so historical skill weight fades when a teammate moves stacks.

### Smarter Assignment (Phase C — LLM judgment overlay)

- [ ] **JUDGE-01**: When the math fit-score gap between candidate #1 and candidate #2 is less than 0.15, the dispatcher invokes an LLM judgment call to pick the final assignee.
- [ ] **JUDGE-02**: When the gap is ≥ 0.15, math wins outright — no LLM call (cost short-circuit).
- [ ] **JUDGE-03**: The LLM judgment call uses anonymized candidate labels (`candidate_1`, `candidate_2`, `candidate_3`) — never real names or pronouns, to prevent name / gender bias.
- [ ] **JUDGE-04**: The LLM judgment call returns a structured `{chosen_index, tiebreaker_factor, confidence}` schema — no freeform reasoning string that can hallucinate.
- [ ] **JUDGE-05**: If the LLM provider chain fails, errors out, or returns an invalid response, the dispatcher falls back to the pure-math top-1 candidate without breaking the assignment flow.
- [ ] **JUDGE-06**: All tiebreaker decisions in a single dispatch run are batched into ONE LLM call (8 close-call tasks → 1 call, not 8).
- [ ] **JUDGE-07**: Each assignment writes a structured `assignment_reasoning` JSONB column on `agent_tasks` containing math score breakdown AND (when used) the LLM tiebreaker factor.
- [ ] **JUDGE-08**: The task detail UI surfaces a human-readable "why this person" line built from the math + LLM reasoning — never a black box.
- [ ] **JUDGE-09**: Assignment is cached by `(taskId, candidateIds-sorted, mathScoresHash)` so cron retries on the same task do not flip the assignee.
- [ ] **JUDGE-10**: A per-team daily LLM budget cap (configurable) forces math-only fallback once exceeded for that day.

### Personalized Framing (Phase D — AI PM persona)

- [ ] **FRAME-01**: When a task is assigned, a `task_reframe` job is enqueued (never inline in the dispatcher) to generate a personalized description for the assignee.
- [ ] **FRAME-02**: The personalized description is stored in a new `agent_tasks.personalized_description` column alongside the original brain-generated description (original preserved).
- [ ] **FRAME-03**: The personalized description includes: why this fits the assignee, where to start (file or folder pointer), and how it connects to recent project state (analytics change, code area, prior task) — when those signals exist.
- [ ] **FRAME-04**: The personalized description is tied to a `personalized_description_for_user_id` column. If the task is reassigned to a different person, the column is invalidated and a new reframe job is enqueued.
- [ ] **FRAME-05**: The assignee sees the personalized description in the task detail UI and in the assignment email. The owner / re-assignment flow sees the original.
- [ ] **FRAME-06**: Reframing tone is bounded by the prompt registry (no flattery, no sycophancy, no familiarity assumptions). A bounded set of acceptable rhetorical moves is whitelisted in `prompts.ts`.
- [ ] **FRAME-07**: Reframing never references personal information the assignee did not declare in their profile (no inference of preferences from external data).

### Live Code Signal (Phase E — Brain freshness)

- [ ] **LIVECODE-01**: A new `live_code_summary` job kind analyzes only files changed since the last brain run (incremental, not full repo), using `compareCommitsWithBasehead` from `@octokit/rest`.
- [ ] **LIVECODE-02**: A new `project_file_summaries` table caches per-file summaries keyed by `(project_id, file_path, file_sha)`. Unchanged files (matching SHA) skip re-analysis.
- [ ] **LIVECODE-03**: The brain consumes a `LiveCodeDelta[]` signal from `liveCode.ts` alongside the existing GA4 metrics and GitHub-diff inputs.
- [ ] **LIVECODE-04**: A per-dispatch mint cap (default 5, configurable per team) prevents task explosion when live code signals fire heavily.
- [ ] **LIVECODE-05**: A capacity-aware mint gate skips new minting when team WIP exceeds 1.5× combined team capacity.
- [ ] **LIVECODE-06**: Per-source 7-day cool-down: even if the same signal (same file family, same analytics drop) keeps firing, no duplicate-family tasks within 7 days.
- [ ] **LIVECODE-07**: The stale `project_analyses.analysis` blob remains as a fallback source so live code is purely additive — no rip-out of the existing brain path during rollout.
- [ ] **LIVECODE-08**: Tree-sitter WASM grammars (`web-tree-sitter` + TS / TSX + Python) are bundled server-side; tree-sitter does not leak into the client bundle. Octokit and tree-sitter are added to `serverExternalPackages` in `next.config.js`.

### Cross-Cutting Quality Requirements

These apply across phases A — E and are enforced during phase planning and verification.

- [ ] **QUAL-01**: A CI test exists where the same fit-profile coded with different names yields roughly uniform candidate picks across at least 5 fixture scenarios (name / gender bias regression test).
- [ ] **QUAL-02**: All user-controlled content fed to LLM calls (task descriptions, commit messages, profile text) is wrapped in `<user_content>` delimiters with system instructions treating them as untrusted data.
- [ ] **QUAL-03**: For LLM judgment calls, post-hoc validation rejects any `chosen_id` not present in the math-pre-filtered candidate set (defense against prompt injection picking an out-of-set candidate).
- [ ] **QUAL-04**: Telemetry logs: cost per dispatch run, count of LLM judgment calls, count of fallback-to-math events, count of reframe jobs queued — accessible via existing logger.
- [ ] **QUAL-05**: All new LLM calls go through the existing `chatViaChain` (Gemini → Claude fallback) and respect the existing `llm_health` circuit breaker.
- [ ] **QUAL-06**: All new LLM calls use `temperature: 0` for deterministic re-runs.

## Deferred Requirements (next milestone)

Acknowledged but not in this roadmap. Documented to prevent accidental scope creep AND to make it explicit they were considered.

### Stretch Tasks

- **STRETCH-01**: A task can be flagged as a "stretch / learning" assignment for a teammate to grow into a new skill — diff between low-skill teammate and well-fitting senior teammate is intentional, with senior tagged as reviewer.

### Delivery Channels

- **DELIVERY-01**: Slack notification when a task is assigned (currently: email only).
- **DELIVERY-02**: Calendar integration (Google / Outlook) so dispatcher respects real busy time, not just declared working hours.
- **DELIVERY-03**: Mobile-native UI for the dispatcher / teammate / task surfaces (currently: desktop only).

### Advanced Brain

- **BRAIN-01**: Semantic-similarity task dedup using embeddings (currently: exact-match `dedupKey` only).
- **BRAIN-02**: Cross-project dependency awareness (task A in project X depends on task B in project Y).

### Feedback Loop

- **FEEDBACK-01**: Rebuild user-feedback ingestion (removed 2026-05-11) as a brain input source — separate milestone, not v3.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep AND for future-me to remember the reasoning.

| Feature | Reason |
|---------|--------|
| Full-LLM dispatcher (LLM picks freely from all teammates, no math pre-filter) | Less predictable, less explainable, more expensive. Hybrid math + LLM judgment is the chosen approach (PROJECT.md Key Decisions). |
| AI synthetic teammates | Removed in migration `20260505_remove_ai_teammates.sql`. Dispatcher routes only to real human users with email + calendar. |
| AI tool-use for teammates (autonomous code execution) | Parked 2026-04-27 ("agents real work deferred"). v3 must not assume autonomous AI execution. |
| Black-box assignment (no reasoning shown) | Explainability is core to Core Value. Every assignment must show a human-readable "why" line. |
| Public fit-score leaderboards / gamification | Toxic team dynamics risk. Internal telemetry only; teammates see their own profile, never others' scores. |
| Forced reassignment without owner override | Loss of agency. Owner can always manually override any AI pick. |
| Vector store / embedding store | Bounded skill vocabulary kills the embedding case. Postgres + Jaccard + EMA is sufficient signal. |
| LangChain / Mastra / Vercel AI SDK adoption | Existing `chatViaChain` already provides the abstraction; framework adoption would create two parallel LLM paths. |
| Synchronous LLM call inside a request handler | All new LLM work goes through the existing `llm_jobs` queue. Vercel functions are stateless and time-bounded. |
| Mining personal (non-team) GitHub repos for skill inference | Privacy / consent boundary. Mining is scoped strictly to team-connected repos. |
| Freeform "reason" string in LLM judgment output | Hallucination risk. Output schema is structured (`{chosen_index, tiebreaker_factor, confidence}`) only. |
| User feedback ingestion (rebuild the removed feature) | Separate milestone. v3 inputs are codebase + analytics + GitHub only. |

## Traceability

Filled by the roadmapper. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROFILE-01 | Phase 1 | Pending |
| PROFILE-02 | Phase 1 | Pending |
| PROFILE-03 | Phase 1 | Pending |
| PROFILE-04 | Phase 1 | Complete |
| PROFILE-05 | Phase 1 | Complete |
| PROFILE-06 | Phase 1 | Complete |
| SKILL-01 | Phase 2 | Complete |
| SKILL-02 | Phase 2 | Pending |
| SKILL-03 | Phase 2 | Complete |
| SKILL-04 | Phase 2 | Pending |
| SKILL-05 | Phase 2 | Complete |
| SKILL-06 | Phase 2 | Pending |
| JUDGE-01 | Phase 3 | Pending |
| JUDGE-02 | Phase 3 | Pending |
| JUDGE-03 | Phase 3 | Pending |
| JUDGE-04 | Phase 3 | Pending |
| JUDGE-05 | Phase 3 | Pending |
| JUDGE-06 | Phase 3 | Pending |
| JUDGE-07 | Phase 3 | Pending |
| JUDGE-08 | Phase 3 | Pending |
| JUDGE-09 | Phase 3 | Pending |
| JUDGE-10 | Phase 3 | Pending |
| FRAME-01 | Phase 4 | Pending |
| FRAME-02 | Phase 4 | Pending |
| FRAME-03 | Phase 4 | Pending |
| FRAME-04 | Phase 4 | Pending |
| FRAME-05 | Phase 4 | Pending |
| FRAME-06 | Phase 4 | Pending |
| FRAME-07 | Phase 4 | Pending |
| LIVECODE-01 | Phase 5 | Pending |
| LIVECODE-02 | Phase 5 | Pending |
| LIVECODE-03 | Phase 6 | Pending |
| LIVECODE-04 | Phase 6 | Pending |
| LIVECODE-05 | Phase 6 | Pending |
| LIVECODE-06 | Phase 6 | Pending |
| LIVECODE-07 | Phase 5 | Pending |
| LIVECODE-08 | Phase 5 | Pending |
| QUAL-01 | Phase 3 | Pending |
| QUAL-02 | Phase 2 | Pending |
| QUAL-03 | Phase 3 | Pending |
| QUAL-04 | Phase 6 | Pending |
| QUAL-05 | Phase 1 | Pending |
| QUAL-06 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 43 total (6 PROFILE + 6 SKILL + 10 JUDGE + 7 FRAME + 8 LIVECODE + 6 QUAL)
- Mapped to phases: 43
- Unmapped: 0

**Per-phase counts:**
- Phase 1 (Profile Foundation): 8 (PROFILE-01..06, QUAL-05, QUAL-06)
- Phase 2 (GitHub Skill Inference): 7 (SKILL-01..06, QUAL-02)
- Phase 3 (LLM Judgment Overlay): 12 (JUDGE-01..10, QUAL-01, QUAL-03)
- Phase 4 (Personalized Task Framing): 7 (FRAME-01..07)
- Phase 5 (Live Code Infrastructure): 4 (LIVECODE-01, 02, 07, 08)
- Phase 6 (Brain Integration & Cost Guards): 5 (LIVECODE-03, 04, 05, 06, QUAL-04)
- Total: 8+7+12+7+4+5 = 43 ✓

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 after roadmapper traceability fill*
