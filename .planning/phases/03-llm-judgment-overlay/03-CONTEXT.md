---
phase: 03-llm-judgment-overlay
gathered: 2026-05-13
status: ready_for_planning
---

# Phase 3: LLM Judgment Overlay — Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

On close fit-score calls (gap < 0.15), the dispatcher invokes ONE batched LLM tiebreaker per cron run that picks the final assignee from the math top-3 with anonymized candidate labels and a structured schema. The LLM is given the FULL context for each candidate (math score + breakdown + skill tags + recent task history) so it can break ties on real fit, not just numbers. The tiebreaker returns both a structured `reason_code` (from a fixed list) AND a short validated sentence — combined, this powers a "Why you got picked" line that surfaces in the assignment email and the task pop-up. Math fallback is silent on any LLM failure, malformed response, or daily safety-cap exhaustion. Each assignment writes `assignment_reasoning` JSONB so the explanation is auditable. Bias-regression CI test (QUAL-01) gates the prompt.

**Locked structurally** (from ROADMAP + REQUIREMENTS + Phase 1/2 — not re-debated):
- Gap threshold: < 0.15 → LLM; ≥ 0.15 → math-only (JUDGE-01 / JUDGE-02). Cost-driven choice; planner may simulate widening since v3 quality > cost.
- Top-3 candidates only (JUDGE-01).
- Anonymized labels `candidate_1 / candidate_2 / candidate_3` — never names, emails, or pronouns (JUDGE-03 + QUAL-01).
- Output schema fixed to structured fields (JUDGE-04). No freeform reasoning string at the schema level.
- ONE batched LLM call per dispatch run for all close-call tasks (JUDGE-06).
- Math fallback on any LLM failure, malformed JSON, or invalid `chosen_id` (JUDGE-05 + QUAL-03).
- Cache key `(taskId, candidateIds-sorted, mathScoresHash)` — no re-judging on cron retries (JUDGE-09).
- `assignment_reasoning` JSONB column on `agent_tasks` (JUDGE-07).
- Per-team daily LLM safety cap exists (JUDGE-10) — see D-30 for v3-specific framing.
- `temperature: 0` + `chatViaChain` for the judgment call (ROADMAP success criterion 5).
- Bias-regression CI test with 5 fixture scenarios (QUAL-01).
- Post-hoc `chosen_id` validation against the math-pre-filtered candidate set (QUAL-03).
- Researcher recommended: `/gsd-research-phase` should prototype the batch judgment prompt + bias-fixture set before plan-check.

**Carried forward from earlier phases:**
- `profileMerge(teammate, profile, inferred, ema)` is the read-path the judge consumes — already feeding the 3-source blend (self / inferred / EMA) per Phase 2 D-23.
- `match.ts.MatchResult.breakdown` already returns the four-component breakdown (skill / fit-kind / availability / load) plus the interest-nudge term — the judge prompt consumes this directly.
- `chatViaChain` is the only LLM entry point (Phase 1 D-13 precedent); `circuitBreaker.ts` already handles provider health.
- `prompts.ts` + `schemas.ts` rule — all new prompts and Zod schemas land in those single files (Phase 1 + 2 precedent).
- Phase 1 D-21 "Recgon IS the AI Product Manager — not an app with AI inside it" — copy for the "Why you" line follows that voice.
- "Why" line privacy rule mirrors fit-score privacy (Phase 1 D-20): each teammate sees their OWN reason, owners see everyone's, no teammate sees another's.

</domain>

<decisions>
## Implementation Decisions

### Judge evidence payload (what the LLM sees per candidate)

- **D-27:** **The LLM gets the richest available signal for each anonymized candidate.** Per candidate, the judgment prompt includes:
  - Total fit score (e.g. `0.71`)
  - All four math-breakdown components (`skill_match`, `fit_for_task_kind`, `calendar_availability`, `workload_headroom`) — both numeric and a low/medium/high qualitative band so the LLM can reason without re-running arithmetic.
  - The candidate's confirmed skill tags (anonymized — only canonical vocab labels, never user-typed raw text).
  - Recent task history: completed tasks in the last 14 days that match the task's required skills or kind, with average rating. Format example: "finished 3 React tasks (avg rating 4.5), 1 Python task (avg rating 4.0)".
- **Rationale:** v3 priority is quality > cost (see memory `project_quality_over_cost_v3`). More context per candidate means smarter tiebreakers. The cost trade-off is accepted; the safety cap (D-30) bounds runaway risk.
- **Implication for planner:** the "recent task history" payload requires a cheap per-teammate query against `agent_tasks` filtered by `completed_at >= now - 14d` and the task's required skills/kind. Planner should design it as a single batched read keyed by `teamId` (no N+1 per candidate).

### Reason structure (what the LLM returns + what teammates see)

- **D-28:** **Structured `reason_code` enum + a short validated free sentence.** The judgment output schema is:
  - `chosen_candidate_id` (1, 2, or 3 — anonymized, mapped back to real teammate ID server-side)
  - `reason_code` — one of a fixed enum (initial suggested set: `recent_track_record`, `interest_match`, `skill_depth`, `task_kind_familiarity`, `capacity_headroom`). Planner refines the final enum after researcher prototypes the prompt and shows what reasons the LLM actually picks.
  - `reason_sentence` — one short human sentence (≤ ~25 words) flavored by the chosen reason. Must be post-validated:
    - Must reference a skill / signal that ACTUALLY exists in the candidate's payload (skill, fit-kind, recent task) — defense against hallucinated reasoning (Pitfall 3 from research/SUMMARY.md).
    - Must not name another candidate, must not mention names/pronouns of any kind (the candidates were anonymized to the LLM anyway, but belt-and-suspenders).
    - Must not exceed length limit. Falls back to a template-rendered version of the `reason_code` if the sentence fails validation.
  - `confidence` (low / medium / high) — used by the UI to optionally soften copy ("might fit you because…" when low).
- **Implication for planner + researcher:** the post-hoc validator is non-trivial — schema validation alone isn't enough. Researcher should propose a validator design alongside the prompt prototype.

### "Why you" line — where teammates see it

- **D-29:** **The "Why you got picked" line surfaces in TWO places: the assignment email AND the task detail pop-up.** Calendar tile stays clean (no extra line, no tooltip). Mock copy:
  - Assignment email: a one-line callout in the body — "**Why you:** recent track record (you finished 3 similar React tasks in the last two weeks)."
  - Task pop-up (`TaskDetailPanel`): a `WHY YOU` section inline with title/status/skills, same copy.
- **Privacy rule (inherited from Phase 1 D-20 analog):**
  - Each teammate sees their OWN "why" line (in their email + their task pop-up).
  - Owner sees the "why" line for every task (any teammate's).
  - No teammate sees another teammate's "why" line — even when `profile_visibility = team_visible`. The reasoning is private like the raw fit score.
- **Math-only assignments still get a "Why you" line:** rendered from the math breakdown alone ("**Why you:** your skill match was strongest among teammates available this week"). No black-box assignments anywhere (JUDGE-08).
- **Implication for planner:** the email template (existing `notifyTeammateAssigned`) and `TaskDetailPanel` both need a new "Why you" block. The renderer is the same function in both surfaces — single source of truth for the copy.

### Daily AI safety cap (re-framed under v3 quality-over-cost)

- **D-30:** **The daily cap is a SAFETY rail, not a quality knob.**
  - **Set by Eneskis in code/env** (single value, applies to every team). No team-owner UI setting. The roadmap word "configurable" is satisfied — a developer-facing constant or env var is configurable.
  - **Generous by default** — sized so real-world usage never hits it. Planner picks the starting number (suggest: 50 batched judgment calls per team per day = ~5× expected peak under "every dispatch is a close call" scenario). Tune later if telemetry shows the wrong order of magnitude.
  - **At the cap: silent fallback to math-only for the rest of that day** (JUDGE-10 requirement) — teammates see a math-only "Why you" line as if nothing happened, no banner, no owner email. Hitting the cap means something is wrong, not that the team should adjust behavior.
  - **Eneskis (developer) gets an alert when the cap is hit** — bug-detection signal. Implementation: server log at WARN level + (optional, planner's call) an email to a dev-ops address from `.env.local` (e.g. `DEV_OPS_ALERT_EMAIL`). Single-address, not per-team.
- **Rationale:** v3 priority is quality > cost (memory `project_quality_over_cost_v3`). Owners shouldn't see a setting they can't meaningfully evaluate, and they shouldn't be alarmed by a budget event that's really a bug signal.

### Claude's Discretion (planner / researcher decides)

- **Reason enum final values.** Initial set (`recent_track_record`, `interest_match`, `skill_depth`, `task_kind_familiarity`, `capacity_headroom`) is a starting point. Researcher should prototype prompts and observe which reasons the LLM actually selects; planner adjusts the enum to what's empirically useful.
- **Starting cap value.** D-30 suggests 50 calls/team/day. Planner picks the actual number based on Gemini Flash + Claude Haiku pricing math and expected dispatch volume.
- **Widen the 0.15 gap threshold?** JUDGE-01 locks 0.15 but the rationale was cost. Under v3 quality > cost, the planner should simulate (against historical close-call distributions if any data exists) whether 0.20 or 0.25 would catch more meaningful close calls without practical concern. Final value lands in the plan, not in this CONTEXT.md.
- **Validator design for the free sentence.** D-28 mandates post-hoc validation but the exact rules are researcher + planner territory (substring matching against candidate payload, simple deny-list, or LLM-based judge — researcher proposes).
- **Edge case: < 3 candidates clear `MIN_FIT_SCORE`.** Roadmap says "math top-3" but real teams may have only 1 or 2 candidates above the floor. Planner decides: judge top-2 anyway? Skip LLM and assign math top-1? Most defensible: skip LLM when fewer than 2 candidates clear (no actual tie to break); judge top-2 when exactly 2 clear AND the gap is < 0.15.
- **Manual override semantics.** If an owner manually reassigns AFTER the judge picked, what's stored in `assignment_reasoning`? Probably: keep the original judge reasoning, append an `overridden_by` event with the owner's note. Planner decides.
- **Schema location for `assignment_reasoning` JSONB.** Migration shape (additive column on `agent_tasks`) + the Zod schema for the JSONB contents. Following the existing additive-migration pattern.
- **How the dev-ops alert lands.** Server log + optional email — planner picks the simplest path that gives Eneskis a real signal without spamming.
- **Bias-regression fixture vocabulary.** QUAL-01 mandates 5 fixture scenarios with same fit-profile coded with different names. Researcher proposes the name spread (English / Turkish / Arabic / Asian / Spanish, gender mix). Researcher also defines "roughly uniform" quantitatively (e.g. no single name gets > 35% of picks across 100 runs).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning artifacts
- `.planning/ROADMAP.md` §Phase 3 — Phase goal, 5 success criteria, plans hint
- `.planning/REQUIREMENTS.md` §Judge (JUDGE-01..10) + §Quality (QUAL-01, QUAL-03) — locked requirements
- `.planning/PROJECT.md` — Constraints, Key Decisions, voice/positioning
- `.planning/STATE.md` — Current position, prior decisions log

### Prior-phase context (these decisions feed Phase 3)
- `.planning/phases/01-profile-foundation/01-CONTEXT.md` — D-06..D-08 (`profileMerge` policy), D-20 (fit-score privacy → mirrored by "why" line privacy in D-29), D-21 (Recgon-as-AI voice)
- `.planning/phases/01-profile-foundation/01-02-SUMMARY.md` — `profileMerge` 4-arg signature, interest-nudge semantics
- `.planning/phases/01-profile-foundation/01-04-SUMMARY.md` — dispatcher wiring pattern (`listProfiles` → `profileMerge` → `rankMatches`) — Phase 3 inserts the judge AFTER `rankMatches`
- `.planning/phases/02-github-skill-inference/02-CONTEXT.md` — D-23 (three-source blend), D-24 (rejected-skills filter)
- `.planning/phases/02-github-skill-inference/02-04-SUMMARY.md` — read-time decay (τ=90d) on inferred + EMA

### Research outputs (Phase 3 must read these)
- `.planning/research/SUMMARY.md` §Pitfalls — especially Pitfall 1 (stale EMA), 2 (selection-bias monoculture), 3 (hallucinated reasoning), 4 (run-to-run variance), 6 (name/gender bias), 9 (prompt injection), 10 (context mismatch)
- `.planning/research/ARCHITECTURE.md` C1-C2 — `judge.ts` shape + `JudgeResultSchema` first sketch
- `.planning/research/STACK.md` — confirms no new packages for Phase 3 (reuses `chatViaChain`)
- `.planning/research/PITFALLS.md` — full pitfall context if SUMMARY excerpts are insufficient
- `.planning/research/FEATURES.md` — feature decomposition (rejected for build-order, but useful for understanding scope)

### Codebase maps (read before touching `src/lib/recgon/`)
- `.planning/codebase/ARCHITECTURE.md` — where Phase 3 lands in the dispatcher stack
- `.planning/codebase/CONVENTIONS.md` — code style, prompts-in-one-file, schemas-in-one-file
- `.planning/codebase/STRUCTURE.md` — directory layout for new files (`src/lib/recgon/judge.ts`)
- `.planning/codebase/STACK.md` — locked tech

### Existing source files Phase 3 touches or extends
- `src/lib/recgon/match.ts` — `rankMatches` + `MatchResult.breakdown` (judge consumes breakdown directly; UNCHANGED in Phase 3)
- `src/lib/recgon/dispatcher.ts` lines 132 (`runDispatch`) + 429 (`dispatchTask`) — judge insertion point AFTER `rankMatches`, BEFORE `pickBestScheduledMatch` / assignment
- `src/lib/recgon/profileMerge.ts` — read-path that produced the merged teammate the judge sees
- `src/lib/recgon/storage.ts` — `agent_tasks` CRUD + `assignTask` (Phase 3 adds `assignment_reasoning` writes)
- `src/lib/recgon/types.ts` — new `JudgeResult` / `AssignmentReasoning` types land here
- `src/lib/llm/providers.ts` — `chatViaChain` is the ONLY LLM entry point (locked by ROADMAP success criterion 5)
- `src/lib/llm/circuitBreaker.ts` — existing breaker pattern; the judge call leans on it for free
- `src/lib/llm/utils.ts` — `withTimeout` precedent for the judgment call timeout
- `src/lib/prompts.ts` — new `JUDGE_ASSIGNMENT_*` prompt(s) land here
- `src/lib/schemas.ts` — new `JudgeResultSchema` Zod schema lands here
- `src/components/v2/calendar/TaskDetailPanel.tsx` — UI surface for the "Why you" block
- `src/lib/recgon/dispatcher.ts` (search for `notifyTeammateAssigned`) — email template hook for the email-side "Why you" line

### Migration patterns
- `supabase/migrations/20260505_strip_markdown_in_tasks.sql` — recent `agent_tasks` additive pattern
- `supabase/migrations/20260506_day_precision_schedule.sql` — additive column pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`chatViaChain` / `chatViaProviders`** (`src/lib/llm/providers.ts`): the ONLY LLM entry point for the judgment call. No new provider work required. Already routes Gemini → Claude fallback for free.
- **`circuitBreaker.ts`**: 5-failures-in-30s opens a 60s breaker. The judgment call gets this for free — Phase 3 doesn't add new health checking.
- **`match.ts.MatchResult.breakdown`**: already returns `{skill, fitKind, availability, load, interestNudge?}` per candidate. Direct feed into the judge prompt — no remapping needed.
- **`agent_tasks` table**: already exists, scoped by `team_id`. Phase 3 adds ONE additive column `assignment_reasoning JSONB` (default `null`, populated on every assignment going forward).
- **`prompts.ts` + `schemas.ts` pattern**: judge prompts + `JudgeResultSchema` land in those files (hard rule).
- **`TaskDetailPanel.tsx`**: already renders task title / status / skills / schedule. Phase 3 adds a `WHY YOU` block — uses the same panel layout (no new component scaffolding).
- **Email template (`notifyTeammateAssigned` in `src/lib/recgon/dispatcher.ts`)**: existing assignment email. Phase 3 adds a one-line `**Why you:**` callout — minor template change.
- **`fitProfile.taskKindScores`** (already on `Teammate`): per-kind EMA — used to compute "task type familiarity" reason signal without new queries.

### Established Patterns
- **`temperature: 0` + Zod schema + post-hoc filter** for new LLM calls (Phase 1 D-13 precedent; QUAL-05/06 hard rule).
- **`chatViaChain` with `timeoutMs`** for in-call timeout safety (Phase 1 SUMMARY 01-03 — Pitfall 8).
- **`<user_content>...</user_content>` wrapping** for untrusted text (Phase 2 D-23 + QUAL-02). The judgment prompt itself has no user-typed content but candidate skill tags are vocab-only — no wrapping needed there. If the planner adds recent task TITLES to the payload (instead of just skills/ratings), those titles need wrapping.
- **Cache-key pattern**: cache by structured tuple, NOT freeform string. JUDGE-09 mandates `(taskId, candidateIds-sorted, mathScoresHash)`. The hash function lives in `src/lib/recgon/judge.ts`.
- **Additive migrations only** — `agent_tasks.assignment_reasoning` is additive, default `null`, fully backwards compatible.
- **Pure-function unit testing** (Phase 1 D-?? precedent for `profileMerge.ts`): `judge.ts` should expose a pure `runJudgment(candidates, task, options)` that takes injected `chat` adapter so unit tests don't hit the network. Bias-regression CI test (QUAL-01) hooks here.

### Integration Points
- **Dispatcher**: judge insertion goes AFTER `rankMatches(...)` and BEFORE `pickBestScheduledMatch(...)` in both `runDispatch` (line 132+) and `dispatchTask` (line 429+). Single helper `applyJudgmentIfClose(ranked, task, ctx)` consumed by both paths — no duplicate code.
- **Email + UI renderer**: shared `renderWhyYou(reasoning: AssignmentReasoning): string` function. Email and `TaskDetailPanel` both call it. Single source of truth for copy.
- **`assignment_reasoning` writes**: `assignTask` (`storage.ts`) gains a new optional `reasoning` parameter. Existing call sites pass it; the column is `null`-tolerant for pre-Phase-3 rows.
- **Daily cap counter**: lightweight counter on `teams` (or a new `team_llm_usage` row) keyed by `(team_id, date)`. Increment per judgment call; check before the call. Planner picks the storage shape.

</code_context>

<specifics>
## Specific Ideas

- **"Why you got picked" copy voice (D-29)** — must inherit Phase 1 D-21 "Recgon IS the AI Product Manager" voice. No "AI says...", no "the algorithm thinks...". Direct second-person address: "**Why you:** recent track record (you finished 3 similar React tasks in the last two weeks)." Sounds like a manager explaining a choice, not an app surfacing AI output.

- **Email mock (D-29)**:
  ```
  ┌──────────────────────────────────────────┐
  │  New task: Fix login redirect             │
  │                                           │
  │  3h estimated · React, Auth · this week   │
  │                                           │
  │  Why you: recent track record (you        │
  │  finished 3 similar React tasks in the    │
  │  last two weeks).                         │
  └──────────────────────────────────────────┘
  ```

- **Task pop-up mock (D-29)** — added to `TaskDetailPanel.tsx`:
  ```
  WHY YOU
  Recent track record — you finished 3 similar
  React tasks in the last two weeks.
  ```
  No header chip, no badge, no "AI" label. Just `recgon-label` styling for the "WHY YOU" header, body in Inter.

- **The judge prompt MUST NOT include real names anywhere** — even in template text. The prompt refers strictly to "candidate_1 / candidate_2 / candidate_3". The bias-regression CI test (QUAL-01) confirms this stays true across fixture variations.

</specifics>

<deferred>
## Deferred Ideas

(Captured during discussion; not for Phase 3 — re-evaluate later phases or future milestone.)

- **Team-owner-controlled cap with a UI slider** (D-30 considered, rejected). Could revisit if real-world telemetry shows teams have wildly different needs and someone wants to pay for more headroom. Not in v3.
- **"Why you" line on calendar tile (hover tooltip)** (D-29 considered, rejected as too noisy). Could revisit if user-feedback shows teammates miss the email AND don't click the pop-up.
- **Live AI usage dashboard for the owner** ("you used 7/50 judgment calls today"). Considered, deferred — owners don't see the cap, so there's nothing to display. Could land alongside a future monetization phase when usage becomes user-facing.
- **Reroute the judge to a different LLM family** (e.g. dedicated reasoning model when one ships). Stick with `chatViaChain` (Gemini → Claude) for v3 — change-management headroom for later.
- **LLM judge for the AI's OWN minted tasks** ("did the brain mint a good task?"). Out of scope — Phase 3 only judges teammate assignments, not the task quality itself.
- **Per-skill-type τ variation on EMA** (e.g. security skills decay slower) — deferred from Phase 2 D-23. Still deferred.

</deferred>

<open_questions_for_planner>
## Notes for Researcher / Planner

- **Researcher (REQUIRED for Phase 3):** prototype the batch judgment prompt — given N tasks each with their own top-3 anonymized candidates, what's the prompt shape that returns N picks reliably and within token budget? Test against 5 fixture scenarios (QUAL-01 bias check) where the same fit profile uses different name vocabularies (English / Turkish / Arabic / Asian / Spanish). Define "roughly uniform" quantitatively. Output: a prompt sketch + the JudgeResultSchema Zod shape + the bias-test fixture pack — all land in `.planning/phases/03-llm-judgment-overlay/03-RESEARCH.md`.
- **Researcher (BONUS):** simulate whether widening the 0.15 close-call gap (D-27 / D-30 rationale: cost is de-prioritized) to 0.20 or 0.25 catches more meaningful tiebreakers. Use prior `agent_tasks` rows + breakdowns if any historical data exists. Recommend a value the planner can lock.
- **Researcher (BONUS):** design the post-hoc free-sentence validator (D-28). Substring matching against payload? Simple deny-list? Mini LLM judge? Propose the cheapest design that catches hallucinated content reliably.
- **Plan partition hint:** ROADMAP suggested 4 plans (`judge.ts` + schema + prompts, dispatcher integration + cache + cap, `assignment_reasoning` column + UI line, bias CI test + post-hoc validation). The planner may merge the cap + counter into Plan 2 or split into a fifth — both reasonable.
- **`assignment_reasoning` JSONB shape:** suggested fields — `{kind: 'math_only' | 'llm_tiebreaker', math_score: number, math_breakdown: {...}, judge?: {reason_code, reason_sentence, confidence}, overridden_by?: {user_id, note, ts}}`. Planner finalizes.
- **`renderWhyYou` copy templates:** one template per `reason_code` value, parameterized by candidate-specific signal (e.g. "you finished {N} similar {skill} tasks in the last two weeks"). Lives next to the renderer (suggest `src/lib/recgon/whyYou.ts`).
- **Daily cap storage:** lightest option is a counter on `teams` (`llm_judgment_calls_today INT NOT NULL DEFAULT 0`, `llm_judgment_calls_reset_date DATE`). Reset on first call of a new UTC day. Planner picks vs. a separate `team_llm_usage` table.
- **Dev-ops alert (D-30):** simplest = `logger.error('llm_judgment_cap_exceeded', {teamId, date})` + a check in the existing log-monitoring stream (Sentry / Vercel logs). If Eneskis wants an email, add a single env var `DEV_OPS_ALERT_EMAIL` and a one-shot Resend send on cap hit (dedup by `(teamId, date)` so it's once per team per day, not per call).
- **Bias CI test placement:** `src/__tests__/judge.bias-regression.test.ts` (vitest). Fixture pack in `src/__tests__/fixtures/judge-bias/`. Run mode: invoke `runJudgment` with a stubbed `chat` that returns the real LLM via a mode toggle for offline-safe CI vs. real runs.
- **Where exactly the judge fires in `dispatcher.ts`:** `runDispatch` currently calls `rankMatches` per task in a loop. The judge needs the close-call subset BATCHED across all tasks in the same dispatch — so the planner must restructure: first pass = rank all tasks + identify close-call subset; second pass = ONE batched judge call for the close-call subset; third pass = apply judge results + math-only fallbacks. This is the single biggest mechanical change in Phase 3.

</open_questions_for_planner>

---

*Phase: 3-LLM Judgment Overlay*
*Context gathered: 2026-05-13*
