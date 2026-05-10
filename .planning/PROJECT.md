# Recgon

## What This Is

Recgon is an **AI Product Manager for small teams**. It ingests a team's projects (codebase, GitHub activity, GA4 analytics), maintains a model of each teammate's strengths and capacity, and autonomously mints + assigns tasks to the best-fit person at the right time. Teammates work; Recgon decides *what* to work on next and *who* should do it.

## Core Value

**The right task gets to the right teammate at the right time, with reasoning the teammate can trust.** If everything else fails — landing pages, analytics dashboards, content generation — this one loop must work.

## Requirements

### Validated

<!-- Shipped capabilities of today's Recgon. Locked. -->

**Identity, teams, and access**
- ✓ Email/password + GitHub OAuth login (NextAuth v5, JWT-only) — shipped
- ✓ Multi-tenant team model with owner / member / viewer roles + invitation tokens — shipped
- ✓ Project CRUD scoped by team via Supabase service-role client — shipped

**Project intelligence**
- ✓ Codebase analyzer that walks a repo and produces `project_analyses.analysis` (prioritized next steps, risks, opportunities) — shipped
- ✓ GA4 Data API integration (6 parallel reports) with per-user OAuth + analytics insights — shipped
- ✓ GitHub repo import + commit/diff fetching via stored OAuth token — shipped
- ✓ Marketing content + campaign generation (Instagram / TikTok / Google Ads) — shipped

**Dispatcher engine (deterministic foundation)**
- ✓ "Brain" aggregates next-steps + growth-metric drift + GitHub diffs per team — shipped (`src/lib/recgon/brain.ts`)
- ✓ Idempotent task minting from brain entries with dedupKey — shipped (`src/lib/recgon/taskMint.ts`)
- ✓ Fit scoring: Jaccard skill overlap (45%) × EMA quality + task-kind fit (30%) + availability (15%) + load headroom (10%) — shipped (`src/lib/recgon/match.ts`)
- ✓ Teammate model with explicit `skills[]`, `capacityHours`, `workingHours`, per-skill EMA in `fitProfile.skillStats` — shipped
- ✓ Owner-fallback escalation when best fit score < 0.4 — shipped
- ✓ Working-hours-aware scheduler — shipped (`src/lib/recgon/scheduler.ts`)
- ✓ Vercel cron drain (`/api/cron/recgon-schedule`) — shipped
- ✓ LLM-driven evidence routing + verification (`evidenceRouter` picks GitHub / GA4 / Firecrawl / proof writeup, `verify` judges pass/fail) — shipped

**Reliability + observability**
- ✓ Multi-provider LLM chain: Gemini 2.5 Flash primary → Claude Haiku 4.5 fallback — shipped
- ✓ Supabase-backed circuit breaker (`llm_health`) with 5-fail / 30s open / 60s cooldown — shipped
- ✓ Persistent LLM job queue (`llm_jobs`) with exponential backoff and stuck-job release — shipped

**Surfaces**
- ✓ Chat / terminal interface (`/v2/terminal`) with slash commands (`/analyze`, `/analytics`, `/content`, `/campaign`) and streaming responses — shipped
- ✓ Stdio MCP server exposing 4 Recgon tools to Claude Code — shipped
- ✓ Hosted MCP OAuth endpoints for Claude.ai — shipped
- ✓ Landing page rebuilt 2026-05-10 around AI PM positioning (pipeline diagram, glass-card aesthetic, light/dark) — shipped

### Active

<!-- Milestone: Smarter AI Product Manager v3. The dispatcher today is pure math
with stale code signal and no teammate self-profile. v3 makes it actually
"understand" the project and the people. -->

**Project understanding — live signal**
- [ ] Recgon sees a **live codebase signal** — incremental analyzer that re-analyzes only changed files since last brain run (not a stale `project_analyses` blob)
- [ ] Brain consumes live code deltas alongside existing GA4 + GitHub-diff inputs when minting tasks

**Teammate understanding — three signal sources, layered**
- [ ] Self-declared **teammate profile UI** — each member fills in skills, strengths, interests, weekly capacity hours
- [ ] **GitHub-inferred skills** — analyze each member's commit history (languages, file paths, PR review patterns) and seed `teammates.skills[]` + `fitProfile.skillStats` from it
- [ ] Existing **EMA-from-task-history** signal continues to refine `fitProfile` as tasks get rated (no change needed beyond ensuring ratings flow in)

**Smarter assignment — LLM judgment overlay**
- [ ] Match math pre-filters to top 2-3 candidates per task; an **LLM judgment overlay** picks the final assignee with a written reason (soft factors: variety, recent load, dependency context)
- [ ] LLM judgment falls back gracefully to pure-math winner when LLM provider chain is unavailable
- [ ] Assignment audit log captures both math score breakdown AND LLM reasoning

**AI PM persona — personalized task framing**
- [ ] When a task is assigned, the AI generates a **personalized description** for the assignee: why this fits them, where to start (file/folder), how it ties to recent project state (analytics drop, code area, prior task)
- [ ] Personalized framing stored alongside original brain-generated description (audit + revert)
- [ ] Original description preserved for owner / re-assignment scenarios

### Out of Scope

<!-- Explicit boundaries. Reasoning included so we don't re-add later. -->

- **User feedback ingestion** — feature was removed 2026-05-11; reintroducing it is its own milestone, not part of v3. Brain inputs for this milestone are codebase + analytics + GitHub only.
- **AI teammates** — removed in migration `20260505_remove_ai_teammates.sql`. Dispatcher routes only to real human users with email + calendar; no synthetic personas.
- **AI tool-use for teammates** — parked 2026-04-27 ("agents real work deferred"). Tools that let AI teammates do work autonomously are not in scope for v3.
- **Full-LLM dispatcher** (LLM picks from all teammates without math pre-filter) — rejected during scoping: less predictable, less explainable, more expensive. Hybrid math + LLM judgment is the chosen approach.
- **Calendar / Slack integration for delivery** — current delivery is in-app + email via Resend. Slack and calendar push are deferred until v3 ships.
- **Mobile-native UI** — landing page is mobile-aware (forced redirect on mobile), but the dispatcher / teammate / task surfaces are desktop-only for v3.

## Context

**Stack:** Next.js 15 App Router + TypeScript + Tailwind. NextAuth v5 (JWT-only). Supabase PostgreSQL (service-role client, server-side). LLM via multi-provider chain (`@google/generative-ai` + `@anthropic-ai/sdk`). Deployed to Vercel (cron drains LLM job queue every minute).

**Brownfield baseline:** Recgon is already a working product. The codebase has been mapped to `.planning/codebase/` (Architecture, Structure, Stack, Conventions, Integrations, Testing, Concerns). All v3 work builds on that foundation — no greenfield rewrites.

**Where the dispatcher lives:** `src/lib/recgon/{brain, dispatcher, taskMint, match, scheduler, skillTagger, verify, evidenceRouter, fitLearning, learn, types}.ts`. v3 changes will land primarily here plus new profile UI under `src/app/teams/[id]/`.

**Prior strategic threads:**
- Agentic Revolution plan (chatbot tools, feedback pipeline, analytics agent, project health agent) — v3 advances the dispatcher half of that plan; feedback pipeline stays deferred.
- Landing redesign (2026-05-10) — already shipped; v3 doesn't touch landing.
- Vercel deployment plan — deferred; v3 ships through existing local-dev → main flow.

**Recently completed cleanups (current branch state):**
- Feedback feature fully removed (UI, backend, schemas, mock data) — 2026-05-11.
- Many demo / landing / component files deleted as part of the same cleanup pass.

## Constraints

- **Tech stack**: Next.js 15 + TypeScript + Tailwind + Supabase — locked. No framework swaps in v3.
- **LLM costs**: Every LLM call costs money. Live-codebase analysis and LLM judgment overlay both add per-task LLM calls — design must keep per-task cost bounded (e.g. summarize before judging, cache profile inferences).
- **Backwards compatibility**: Existing tasks, teammates, and brain runs must continue working through v3 rollout. New fields are additive; old assignments don't break when LLM judgment overlay is introduced.
- **Vercel runtime**: Functions are stateless and time-bounded. Long-running analysis must go through the existing `llm_jobs` queue + cron drain, not synchronous request handlers.
- **Supabase as system of record**: All persistent state in PostgreSQL. No new databases / vector stores in v3 unless explicitly justified during planning.
- **Single dev**: One developer (eneskis). Roadmap should respect that — favor smaller phases over giant ones, even if individual phases ship slower.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v3 milestone goal = smarter dispatcher (project understanding + teammate understanding + LLM judgment + reframing) | Closest current gap to "AI Product Manager" promise; foundation (math, EMA, teammates table) already exists | — Pending |
| Drop user feedback from v3 inputs | Feature was removed 2026-05-11; rebuilding it would double scope; codebase + analytics are sufficient signal for v3 | — Pending |
| Hybrid math + LLM judgment over full-LLM dispatch | Predictable, explainable, fail-safe; preserves existing fairness math; LLM adds judgment on close calls only | — Pending |
| Three-source skill model (self-declared profile + GitHub inference + existing EMA over time) | Each source covers a different cold-start / drift problem; layered model converges fastest | — Pending |
| Personalized task framing per assignee | The single highest-leverage UX upgrade — turns dispatch into a manager-feeling experience | — Pending |
| Standard granularity, parallel execution, full quality gates (research + plan-check + verifier), Quality model profile (Opus for research/roadmap) | Ambitious milestone justifies the extra agent overhead; first GSD project for this user, so prefer safety + depth over speed | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-11 after initialization*
