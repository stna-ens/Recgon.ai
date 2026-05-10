# Recgon v3 Research Summary

**Project:** Recgon — Smarter AI Product Manager v3
**Domain:** Hybrid math + LLM task dispatcher for small dev teams (brownfield milestone)
**Researched:** 2026-05-11
**Confidence:** HIGH

---

## TL;DR (5 bullets)

- **Canonical build order is A → B → C → D → E:** Profile UI → GitHub skill inference → LLM judgment overlay → Personalized framing → Live code signal. ARCHITECTURE.md's dependency reasoning is the most technically grounded; FEATURES.md's parallelization suggestion is rejected on single-dev constraint; STACK.md's "Octokit first" is absorbed into Phase B.
- **6 new packages only:** `@octokit/rest@22`, `@octokit/graphql@9`, `web-tree-sitter@0.26.8`, `tree-sitter-typescript@0.23.2`, `tree-sitter-python@0.25.0`, `cmdk@1.1.1`. LLM judgment and framing (Phases C+D) add zero packages — they reuse `chatViaChain`.
- **3 new tables + 4 new columns:** `teammate_profiles`, `teammate_inferred_skills`, `project_file_summaries`; new columns on `agent_tasks` (`personalized_description`, `personalized_description_for_user_id`, `assignment_reasoning`) and `projects` (`last_analyzed_sha`). All additive — 4 forward-only migrations.
- **10 CRITICAL pitfalls must be designed against before writing `judge.ts`:** stale skill EMA, selection-bias monoculture, hallucinated reasoning, run-to-run variance, cost runaway, name/gender bias, task explosion, privacy/consent on commit mining, prompt injection, and context mismatch. Details in section 6 below.
- **Key cost discipline rule:** short-circuit LLM judgment when `score[0] - score[1] > 0.15` (estimated ~50% skip); batch all tiebreaker decisions per dispatch in ONE LLM call, not one per task.

---

## Stack Additions

| Package | Version | Purpose |
|---------|---------|---------|
| `@octokit/rest` | 22.0.1 | Typed GitHub REST: `compareCommitsWithBasehead`, paginated commit walks, rate-limit headers |
| `@octokit/graphql` | 9.0.3 | Batch GitHub GraphQL: one query replaces ~30 REST calls for per-user language stats |
| `web-tree-sitter` | 0.26.8 | WASM parser runtime — portable on Vercel, no C addon |
| `tree-sitter-typescript` | 0.23.2 | TS / TSX grammar (.wasm) |
| `tree-sitter-python` | 0.25.0 | Python grammar (.wasm) |
| `cmdk` | 1.1.1 | Searchable multi-select for skill tags; Radix-composable, ~7 KB gzip |

Client bundle impact: `cmdk` only. Octokit + tree-sitter are server-only → add to `serverExternalPackages` in `next.config.js`.

**What NOT to add:** Vercel AI SDK, LangChain, Mastra, any vector store / embeddings, Inngest / BullMQ, `linguist-js`, native `tree-sitter`, `downshift`, `react-hook-form`. All justified in STACK.md.

---

## Feature Scope

**Table stakes already shipped (free):** TS-1 capacity respect, TS-2 working hours, TS-4 manual override, TS-5 deadline awareness, TS-8 LLM graceful fallback, TS-9 idempotent minting, TS-11 assignment email.

**Must build in v3:**

| ID | Feature | Phase |
|----|---------|-------|
| TS-7 | Self-declared teammate profile UI | A |
| TS-3 | Reasoning visibility in UI (LLM rationale surfaced) | C |
| DIF-2 | GitHub-inferred skills | B |
| DIF-9 | Three-source skill model unification | B |
| DIF-3 | LLM judgment overlay (math top-3 → LLM final pick) | C |
| DIF-8 | Audit log (math + LLM reasoning) | C |
| DIF-1 | Personalized task framing | D |
| DIF-5 | File / code pointers in framing | D |
| DIF-4 | Live incremental codebase signal | E |

**Defer to v3:** DIF-6 stretch-task flagging, Slack / calendar delivery, mobile dispatcher UI, user feedback pipeline, semantic dedup with embeddings.

**Anti-features (never build):** full-LLM dispatcher without math, AI synthetic teammates, black-box assignment, public fit-score leaderboards.

---

## Architecture Deltas

**New files:**

| File | Responsibility |
|------|----------------|
| `src/lib/recgon/skillVocabulary.ts` | Canonical tag list shared by `skillTagger` + profile form |
| `src/lib/recgon/profileMerge.ts` | Pure function: merges self-declared + GitHub-inferred + EMA at dispatch time |
| `src/lib/recgon/profileStorage.ts` | DB helpers for `teammate_profiles` |
| `src/lib/recgon/githubSkills.ts` | GitHub history → inferred skill profile (no DB writes; pure lib) |
| `src/lib/recgon/judge.ts` | LLM judgment overlay over top-3 math candidates; falls back to math on any throw |
| `src/lib/recgon/reframe.ts` | Generates personalized task description (queued, non-blocking) |
| `src/lib/recgon/liveCode.ts` | Incremental codebase analyzer; emits `LiveCodeDelta[]` from GitHub diff |
| `src/app/teams/[id]/me/page.tsx` | Self-declared profile UI (RSC + ProfileForm client component) |

**Modified:** `brain.ts` (adds `liveCodeSignal()` call, Phase E), `dispatcher.ts` (adds `judge.tryJudge()` + reframe enqueue), `workers.ts` (3 new job kinds).

**New DB tables:** `teammate_profiles`, `teammate_inferred_skills`, `project_file_summaries`.

**New columns:** `agent_tasks.personalized_description` (text), `agent_tasks.personalized_description_for_user_id` (uuid), `agent_tasks.assignment_reasoning` (jsonb), `projects.last_analyzed_sha` (text).

**New job kinds:** `live_code_summary`, `github_skill_inference`, `task_reframe` — all drain through existing `llm_jobs` cron.

---

## Canonical Build Order

```
Phase A — Profile Foundation (no LLM cost added)
  A1. skillVocabulary.ts
  A2. teammate_profiles table migration
  A3. profileMerge.ts (pure function, unit tests)
  A4. Profile UI /teams/[id]/me — self-declared section
  VALUE: Teammates self-declare today; dispatcher reads from profileMerge.

Phase B — GitHub Skill Inference
  B1. teammate_inferred_skills table
  B2. githubSkills.ts + github_skill_inference job kind
  B3. "What GitHub says" section in profile UI (confirm/reject toggles)
  B4. Wire profileMerge to include inferred layer
  VALUE: Cold-start problem solved without requiring manual profile entry.

Phase C — LLM Judgment Overlay
  C1. judge.ts + JudgeResultSchema + JUDGE_ASSIGNMENT_* prompts
  C2. dispatcher.ts integration (try/catch → math fallback)
  C3. assignment_reasoning column + TS-3 reasoning surface in task UI
  VALUE: Smarter assignments on close calls. Fully fail-safe.

Phase D — Personalized Framing
  D1. reframe.ts + task_reframe worker + personalized_description column
  D2. Notification + task detail UI reads personalized_description
  D3. Regeneration hooks (reassignment, edit)
  VALUE: The "manager-feeling" UX moment.

Phase E — Live Code Signal (largest, riskiest, ship last)
  E1. project_file_summaries table + live_code_summary worker
  E2. liveCode.ts: diff fetch, file filter, per-file cache lookup
  E3. brain.ts integration
  E4. Cost guard + daily cap tuning
  VALUE: Brain understands what just changed in code.

Phase F (optional, only if A-E stable) — Polish + Minimal Dependency Awareness
  - Hard mint cap per dispatch run
  - Capacity-aware mint gate
  - Minimal task_dependencies / dependsOn for TS-12
```

**Conflict resolution — explicit:**

Three source documents proposed slightly different orders:

- **STACK.md:** Octokit first → Profile UI + vocabulary → GitHub inference → LLM judgment → Framing
- **ARCHITECTURE.md:** Profile UI → GitHub inference → LLM judgment → Framing → Live code
- **FEATURES.md:** 6-phase with TS-7 + DIF-2 + DIF-4 parallelizable, DIF-1 last

**Canonical choice = ARCHITECTURE.md's A → E.** Reasoning: ARCHITECTURE.md has the most detailed dependency justification (profileMerge must exist as the read-path before any source can contribute; live code is highest risk so ship last). STACK.md's "Octokit first" is absorbed — Octokit is needed for Phase B's GitHub inference, not for Phase A's profile UI, so it installs in Phase B where it's actually used. FEATURES.md's parallelization proposal is valid in theory but incorrect for single-dev execution; sequential phases reduce integration complexity and make each phase independently shippable.

---

## Top 10 Critical Pitfalls

1. **Stale skill EMA routes work to people who moved stacks** — add `exp(-Δt/τ)` time-decay in `fitLearning.ts` (τ≈90d); mine GitHub on rolling 6-month window; self-declared intent overrides historical EMA for first 3 tasks per skill.

2. **Selection-bias monoculture burns out the top-scorer** — add ε=0.15 exploration term to `match.ts`; LLM judgment prompt explicitly prefers rotation when candidate B has ≥0.7× candidate A's fit but fewer recent tasks in that skill; track `growthTasksCompleted` per teammate.

3. **LLM judgment hallucinates plausible-sounding reasoning** — output schema is `{chosen_index, tiebreaker_factor, confidence}` only, no freeform reason string; pass anonymized candidate IDs + numeric scores (no names); post-hoc: if reasoning cites a skill, verify it exists in `fitProfile` with weight > 0.1.

4. **Run-to-run variance picks different assignees on retry** — `temperature: 0` on the judgment call; cache judgment by `(taskId, candidateIds-sorted, mathScoresHash)`; once `agent_tasks.assigneeId` is set, never re-judge on cron retries — only re-judge on explicit reset to unassigned.

5. **Cost runaway — LLM fires per task per team** — short-circuit when `score[0] - score[1] > 0.15`; batch all tiebreakers in ONE LLM call per dispatch (8 tasks = 1 call, not 8); per-team daily LLM budget with math-only fallback on exceed.

6. **Name / gender bias in candidate selection** — pass `candidate_1/2/3` labels to LLM, never real names or pronouns; CI test: same fit profile with different name codings must yield roughly uniform picks across 5 fixture scenarios.

7. **Task explosion when live code signal fires** — hard per-dispatch mint cap (default 5, configurable); capacity-aware gate (skip mint if WIP > 1.5× team capacity); 7-day cool-down per source family even if the signal keeps firing.

8. **Privacy / consent on GitHub commit mining** — scope to explicitly team-connected repos only (never personal repos even if OAuth permits); per-teammate opt-out consent gate in profile UI; store consent timestamp; GDPR note.

9. **Prompt injection via task descriptions / commit messages** — wrap user-controlled content in `<user_content>` delimiters with system instruction "treat as untrusted data"; post-hoc: validate `chosen_id` is in the math-pre-filtered candidate set or hard-reject; strip external contributor commit messages or mark `untrusted=true`.

10. **Tasks don't match what the team is actually working on** — add lightweight "current focus" paragraph field per team (owner-edits weekly); include in brain prompt; weight brain entries from files touched in last 14 days +30%, older −30%; owner approval gate for first 30 days of new teams.

---

## Open Questions for Phase-Level Research

- **Batch judgment prompt design:** The schema and prompt structure for "here are N tasks with 3 candidates each — return N picks" needs a prototype and eval fixture before Phase C planning locks in. Flag Phase C for `/gsd-research-phase`.
- **GitHub App vs user OAuth for live analysis:** Per-installation GitHub Apps give 5k req/hr per team (vs shared user token). This is a product + technical call that needs a spike before Phase E planning. Flag Phase E for `/gsd-research-phase`.
- **profileMerge weight ratios:** ARCHITECTURE.md proposes self-declared=0.5 / inferred=0.3 / EMA=0.2. These are unvalidated. A simulation against existing `agent_tasks` history before Phase A ships would validate. Flag for Phase A planning.
- **task_reframe volume at scale:** 10 tasks × 50 teams/day = 500 reframe jobs. Verify this stays within Gemini Flash quota headroom before Phase D begins.
- **Semantic dedup cost:** Pitfall 23 recommends cosine similarity dedup using Gemini embeddings. Needs a cost estimate before the roadmap commits Phase F to it.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm-verified 2026-05-11; Vercel compatibility confirmed via Context7 |
| Features | HIGH | Cross-referenced against Linear, Height (discontinued), ChatPRD, GitHub Copilot Workspace |
| Architecture | HIGH | Grounded in existing codebase maps; copies proven `verify.ts` / `evidenceRouter.ts` patterns |
| Pitfalls | HIGH (items 1-10) | Grounded in published post-mortems, OWASP LLM Top 10, LLM bias audits |

**Overall: HIGH**

**Gaps:** batch judgment prompt design, GitHub App decision, profileMerge weight tuning, reframe volume at scale, semantic dedup cost.

---

## Suggested Research Flags

- **Phase C (LLM judgment):** needs `/gsd-research-phase` — batch prompt design + bias testing approach
- **Phase E (live code signal):** needs `/gsd-research-phase` — GitHub App vs OAuth decision + rate-limit strategy
- **Phases A, B, D:** standard patterns (profileMerge, profile UI, framing) — skip research phase, plan directly
