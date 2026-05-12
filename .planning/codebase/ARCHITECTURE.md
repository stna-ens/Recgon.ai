<!-- refreshed: 2026-05-10 -->
# Architecture

**Analysis Date:** 2026-05-10

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Client (Next.js 15 App Router)                       │
│   `src/app/page.tsx` · `landing/` · `projects/[id]/` · `terminal/` ·         │
│   `teams/` · `calendar/` · `tasks/` · `settings/` · `account/` · `mcp/`      │
│   wrapped by `src/components/AppShell.tsx` → TeamProvider → WorkspaceShell   │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │ fetch / RSC (same-origin)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│         Edge middleware (auth + CSRF)  `src/proxy.ts` (compiled as           │
│         Next.js middleware) using `src/auth.config.ts` (JWT only).           │
│         Rejects cross-origin POST/PUT/PATCH/DELETE, redirects unauth         │
│         users to `/login` (or `/landing` for `/`), forces mobile to          │
│         `/landing`, exempts `/api/auth/**`, `/api/mcp/**`, `.well-known/`.   │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────────────┐
        ▼                            ▼                                    ▼
┌──────────────────────┐ ┌────────────────────────────┐ ┌────────────────────────────┐
│ Route handlers       │ │ NextAuth handler           │ │ MCP OAuth + JSON-RPC       │
│ `src/app/api/**`     │ │ `src/auth.ts` + `[...     │ │ `src/app/api/mcp/**`       │
│ (projects, teams,    │ │ nextauth]/route.ts`        │ │ Bearer-token sessions for  │
│ chat, overview,      │ │ GitHub OAuth + Credentials │ │ Claude.ai / hosted clients │
│ analytics, marketing,│ │ + JWT session              │ │                            │
│ cron, llm/jobs,      │ │                            │ │                            │
│ recgon dispatch)     │ │                            │ │                            │
└──────────┬───────────┘ └─────────────┬──────────────┘ └─────────────┬──────────────┘
           │                           │                              │
           ▼                           ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Business logic (`src/lib/**`)                         │
│  storage / teamStorage / chatStorage / userStorage / analyticsStorage /      │
│  integrationStorage · prompts.ts · schemas.ts ·                              │
│  llm/{providers, circuitBreaker, jobQueue, workers, utils, quality} ·        │
│  recgon/{brain, dispatcher, taskMint, match, scheduler, scheduled,           │
│  skillTagger, verify, evidenceRouter, evidenceSources, fitLearning, learn,   │
│  storage, types} · tools/{registry, runTool, listProjects, ...} ·            │
│  terminal/commands · codeAnalyzer · ideaAnalyzer · competitorAnalyzer ·      │
│  analyticsEngine · contentGenerator · githubFetcher · firecrawl ·            │
│  instagramGraph · email · notifications · rateLimit · analysisQuota ·        │
│  logger · env · apiError · appContext                                        │
└────────────┬───────────────────────────────────────────┬─────────────────────┘
             │                                           │
             ▼                                           ▼
┌──────────────────────────────────┐   ┌────────────────────────────────────────┐
│  Supabase PostgreSQL             │   │  External LLM + data services          │
│  service-role client             │   │  Gemini 2.5 Flash (primary)            │
│  `src/lib/supabase.ts`           │   │  Claude Haiku 4.5 (fallback)           │
│  Tables: users · teams ·         │   │  GA4 Data API · GitHub REST ·          │
│  team_members · team_invitations │   │  Firecrawl · Instagram Graph ·         │
│  projects · project_analyses ·   │   │  Resend (email)                        │
│  agent_tasks · agent_teammates · │   │  via `lib/llm/providers.ts` chain      │
│  llm_jobs · llm_health · …       │   │                                        │
└──────────────────────────────────┘   └────────────────────────────────────────┘

                        ┌──────────────────────────────────────┐
                        │ Standalone MCP server (stdio)        │
                        │ `mcp-server/src/index.ts`            │
                        │ Token-auth (`RECGON_MCP_TOKEN`)      │
                        │ Reads/writes the same Supabase DB    │
                        └──────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Edge middleware | Route protection, JWT-only auth check, same-origin CSRF gate, mobile redirect | `src/proxy.ts` |
| NextAuth core | Provider config (Credentials + GitHub), JWT sign/verify, OAuth waitlist gating | `src/auth.ts`, `src/auth.config.ts` |
| Root layout | Theme + Session + Toast providers, mesh background, `<AppShell>` wrapper | `src/app/layout.tsx` |
| AppShell | Switches between auth shell, team-setup shell, and full WorkspaceShell | `src/components/AppShell.tsx` |
| TeamProvider | Client-side current-team context, projects cache, redirects to `/teams/setup` when empty | `src/components/TeamProvider.tsx` |
| WorkspaceShell | Authenticated chrome (nav, command palette host, avatar menu) | `src/components/WorkspaceShell.tsx` |
| Supabase client | Lazy service-role client, proxied so callers can `import { supabase }` safely | `src/lib/supabase.ts` |
| Project storage | `Project` type + CRUD against `projects` / `project_analyses` / `marketing_content` / `campaigns`, team-scoped | `src/lib/storage.ts` |
| Team storage | Team / member / invitation CRUD + access checks | `src/lib/teamStorage.ts` |
| LLM provider chain | Multi-provider abstraction: Gemini primary, Claude Haiku fallback, retry + timeout | `src/lib/llm/providers.ts`, `src/lib/llm/utils.ts` |
| Circuit breaker | Supabase-backed cross-instance breaker (`llm_health` table) with in-process happy-path cache | `src/lib/llm/circuitBreaker.ts` |
| Job queue | Persistent `llm_jobs` queue: `enqueueJob` / `claimNextJob` (FOR UPDATE SKIP LOCKED) / `completeJob` / `failJob` / `releaseStuckJobs` | `src/lib/llm/jobQueue.ts` |
| Job workers | Per-kind worker dispatch: `idea_analysis`, `codebase_analysis`, `competitor_analysis`, `task_verification`, `commit_summary` | `src/lib/llm/workers.ts` |
| Cron drain | Every-minute Vercel cron pulling `MAX_BATCH=3` jobs, `CRON_SECRET` bearer auth | `src/app/api/cron/llm-jobs/route.ts` |
| Recgon brain | Aggregates "what needs doing" across all team projects from next steps, growthMetrics, GitHub drift | `src/lib/recgon/brain.ts` |
| Recgon dispatcher | Mints tasks from brain entries, scores teammates, assigns, schedules | `src/lib/recgon/dispatcher.ts` |
| Skill tagger | Re-tags task `requiredSkills` from title+description via LLM | `src/lib/recgon/skillTagger.ts` |
| Match + scheduler | Fit scoring, working-hours-aware scheduling | `src/lib/recgon/match.ts`, `src/lib/recgon/scheduler.ts` |
| Evidence router + verifier | LLM-driven verification picks evidence source (GitHub commits, GA4, Firecrawl, proof writeup) then judges pass/fail | `src/lib/recgon/evidenceRouter.ts`, `src/lib/recgon/verify.ts` |
| Tool registry (chat) | Gemini function-calling tools (listProjects, analyzeCode, fetchAnalytics, generateContent, …) | `src/lib/tools/registry.ts` |
| Terminal slash commands | Parser that converts `/cmd args` to directive prompts before hitting `/api/chat` | `src/lib/terminal/commands.ts` |
| MCP stdio server | Separate Node package exposing 4 Recgon tools to Claude Code | `mcp-server/src/index.ts`, `mcp-server/src/tools.ts` |

## Pattern Overview

**Overall:** Next.js App Router monolith with two persistent side channels (Vercel cron-drained job queue and stdio MCP server) on a single Supabase Postgres datastore. Business logic stays out of routes — handlers parse + authorize and delegate to `src/lib/**`.

**Key Characteristics:**
- **Multi-provider LLM chain with shared circuit breaker.** `chatViaChain()` / `chatViaProviders()` (`src/lib/llm/providers.ts`) try Gemini first, fall back to Claude Haiku. The breaker lives in Postgres (`llm_health` table) so every Vercel instance agrees on provider health; fail-open is mandatory so a broken breaker can't degrade working providers.
- **Persistent job queue for long-running AI work.** Heavy analyses (`codebase_analysis`, `competitor_analysis`, `idea_analysis`, `task_verification`, `commit_summary`) are enqueued into `llm_jobs` and drained by `/api/cron/llm-jobs` every minute with exponential backoff (~7.5h retry horizon). Interactive paths use `chatViaChain()` synchronously.
- **Team-scoped data model.** Every domain table carries `team_id`; every route/lib call checks that the authenticated user belongs to the team. Projects, tasks, calendar, chat conversations all key off `teamId`.
- **AI Product Manager dispatcher.** `runDispatch(teamId)` (`src/lib/recgon/dispatcher.ts`) reads the unified brain, mints tasks (idempotent via `dedupKey` + unique partial index), retags stale skills, scores all teammates, and assigns or leaves unassigned with `no_fit` logging. Scheduled recurring entries are minted daily by `/api/cron/recgon-schedule`.
- **All prompts in one file, all Zod schemas in one file.** `src/lib/prompts.ts` and `src/lib/schemas.ts` are the single source of truth — never inline.
- **Same-origin CSRF defense.** `src/proxy.ts` reads `sec-fetch-site` (falling back to `Origin`) and rejects cross-origin mutations before any route runs.

## Layers

**Edge middleware:**
- Purpose: route protection, CSRF defense, mobile gate
- Location: `src/proxy.ts`
- Contains: NextAuth `auth(...)` wrapper with explicit allow/deny rules
- Depends on: `src/auth.config.ts` (JWT-only, no DB during edge auth)
- Used by: every non-static request (matcher in the file excludes assets and `/api/auth/**`)

**Pages (App Router):**
- Purpose: server + client React for the authenticated app and public landing
- Location: `src/app/**/page.tsx` and `layout.tsx`
- Contains: thin RSC pages that fetch overview/projects/teams, plus `'use client'` shells
- Depends on: `src/components/**`, `src/lib/**` (server side)
- Used by: end users via the browser

**API route handlers:**
- Purpose: HTTP/JSON entry points and SSE streams
- Location: `src/app/api/**/route.ts`
- Contains: request parsing, `auth()` + team-access checks, calls into `src/lib/**`
- Depends on: business-logic modules in `src/lib/**`
- Used by: client components via `fetch`, plus Vercel cron and the in-product MCP OAuth flow

**Business logic:**
- Purpose: domain operations (storage, LLM, scheduling, content generation)
- Location: `src/lib/**`
- Contains: typed CRUD helpers, LLM orchestration, schemas, prompts, Recgon dispatcher
- Depends on: Supabase, Gemini/Anthropic SDKs, GA4, Firecrawl, GitHub REST, Resend
- Used by: route handlers, workers, MCP server

**Data:**
- Purpose: persistent state
- Location: Supabase Postgres (cloud), schema in `supabase/migrations/*.sql` and `supabase-schema.sql`
- Contains: tables for users, teams, projects, agent_tasks, llm_jobs, llm_health, analytics_configs, chat_messages, etc.
- Depends on: nothing in-process
- Used by: every storage module via the service-role client

## Data Flow

### Interactive chat with tool calls

1. Client calls `POST /api/chat` with `{ message, history, teamId, conversationId?, projectId? }` (`src/app/api/chat/route.ts:60`).
2. Route checks `auth()` and team membership, loads conversation history and team projects.
3. Gemini is called with `geminiFunctionDeclarations()` (`src/lib/tools/registry.ts:31`); up to `MAX_TOOL_ITERATIONS=5` rounds of tool calls.
4. Each function call is dispatched through `runTool()` (`src/lib/tools/runTool.ts`) to one of `listProjects` / `getProjectDetails` / `analyzeCode` / `fetchAnalytics` / `generateContent` / `generateCampaign`.
5. Final assistant message persisted via `saveMessages()` (`src/lib/chatStorage.ts`); response streamed back as SSE.

### Long-running idea / codebase analysis

1. Route handler (e.g. `src/app/api/projects/[id]/analyze/route.ts`) enqueues via `enqueueJob({ kind: 'codebase_analysis', payload, teamId, userId })` (`src/lib/llm/jobQueue.ts:33`).
2. Vercel cron hits `GET /api/cron/llm-jobs` every minute with `Authorization: Bearer ${CRON_SECRET}`.
3. `releaseStuckJobs()` re-opens timed-out claims; `claimNextJob()` atomically claims up to `MAX_BATCH=3` rows.
4. `runJob(job)` (`src/lib/llm/workers.ts`) dispatches per `kind`; workers call `chatViaChain()` which goes through `shouldTry → Gemini → recordSuccess|recordFailure → Claude fallback` (`src/lib/llm/providers.ts`, `src/lib/llm/circuitBreaker.ts`).
5. On success `completeJob()` writes result + status `succeeded`; on throw `failJob()` schedules exponential-backoff retry until `max_attempts` then marks `dead`.
6. Client polls `GET /api/llm/jobs/[id]` to observe status.

### Recgon AI-PM dispatch loop

1. Trigger: either `POST /api/teams/[id]/recgon/dispatch` (manual) or the daily cron `GET /api/cron/recgon-schedule` calling `runScheduledForTeam()` (`src/lib/recgon/scheduled.ts`).
2. `runDispatch(teamId)` (`src/lib/recgon/dispatcher.ts:90`) calls `readUnifiedBrain(teamId)` to aggregate next steps, growthMetrics, and GitHub drift into `BrainEntry[]`.
3. `mintTasksFromBrain()` (`src/lib/recgon/taskMint.ts:22`) inserts new `agent_tasks` rows; the unique partial index `uq_agent_tasks_source_ref` keeps it idempotent across retries.
4. `ensureFreshSkills()` retags legacy generic skill sets via `tagSingleTaskWithSkills()` (`src/lib/recgon/skillTagger.ts`).
5. `rankMatches()` + `planTaskSchedule()` score every teammate × calendar slot; the best assignment writes via `assignTask()` and `setTaskSchedule()` (`src/lib/recgon/storage.ts`).
6. On `awaiting_review`, `task_verification` jobs run through `runTaskVerification()` (`src/lib/recgon/verify.ts:14`): `evidenceRouter` picks a source, the source fetches evidence, the verifier LLM grades pass/fail/inconclusive, and a quality rating is recorded.

**State Management:**
- Server: Supabase is the only persistent store; no Redis/queue infra.
- Client: React state + `TeamProvider` context for current team and cached projects; NextAuth `SessionProvider` for the user; no Zustand/Redux.

## Key Abstractions

**LLMProvider:**
- Purpose: uniform `chat(systemPrompt, userPrompt, options)` API over Gemini and Anthropic SDKs
- Examples: `geminiProvider`, `claudeProvider` in `src/lib/llm/providers.ts`
- Pattern: adapter + chain-of-responsibility (`chatViaChain`, `chatViaProviders`, optional `chatHedged`)

**Job + Worker:**
- Purpose: durable execution of LLM tasks across cold starts
- Examples: `LLMJob` row in `llm_jobs`; workers in `src/lib/llm/workers.ts`
- Pattern: persistent work queue with `FOR UPDATE SKIP LOCKED`, exponential backoff, max-attempt dead-lettering

**BrainEntry / AgentTask / Teammate:**
- Purpose: AI-PM domain types
- Examples: `src/lib/recgon/types.ts`
- Pattern: snapshot pattern — `readUnifiedBrain` returns a versioned `BrainSnapshot` that `mintTasksFromBrain` turns into rows

**TeammateProfile / InferredSkill (additive over `Teammate`):**
- Purpose: Phase 1 self-declared profile + Phase 2 GitHub-inferred skills, folded into `Teammate` by `profileMerge`
- Examples: `TeammateProfile`, `InferredSkill`, `InferredSkillMap`, `InferredSkillSource`, `UpsertInferredSkillInput` in `src/lib/recgon/types.ts`
- Tables: `teammate_profiles` (Phase 1) + `teammate_inferred_skills` (Phase 2, `teammates(id)` FK, unique `(teammate_id, canonical_tag)`); Phase 2 also adds `teammate_profiles.github_mining_consent_at` / `last_scan_at` and `teams.inference_depth` (cheap/standard/deep)
- Pattern: read-time blend in `profileMerge(teammate, profile, inferred, ema)` — never persisted decayed; rejected rows excluded; canonical-tag filter via `skillVocabulary.ts`

**ToolDefinition:**
- Purpose: typed Gemini function-calling tools
- Examples: `src/lib/tools/types.ts`, registry in `src/lib/tools/registry.ts`
- Pattern: each tool exports `{ name, description, parameters: ZodSchema, execute(ctx, args) }`; registry converts Zod → OpenAPI for Gemini

**Storage modules:**
- Purpose: domain-typed CRUD over Supabase
- Examples: `src/lib/storage.ts`, `src/lib/teamStorage.ts`, `src/lib/recgon/storage.ts`, `src/lib/recgon/profileStorage.ts`, `src/lib/recgon/inferredSkillsStorage.ts`, `src/lib/chatStorage.ts`, `src/lib/analyticsStorage.ts`, `src/lib/integrationStorage.ts`
- Pattern: per-domain module exporting plain async functions, scoped by `teamId`; service-role only — UI never imports these modules

## Entry Points

**Edge middleware:**
- Location: `src/proxy.ts`
- Triggers: every non-static HTTP request (matcher defined at bottom of file)
- Responsibilities: JWT check, CSRF same-origin check, mobile-to-landing redirect, MCP/NextAuth bypass

**NextAuth handler:**
- Location: `src/auth.ts` + `src/app/api/auth/[...nextauth]/route.ts`
- Triggers: `/api/auth/**`
- Responsibilities: credentials + GitHub providers, JWT issuing, waitlist gating in `signIn` callback

**Root layout:**
- Location: `src/app/layout.tsx`
- Triggers: every server-rendered page
- Responsibilities: HTML scaffold, providers (Theme, Session, Toast), Vercel `<Analytics>`, mesh background, mounts `<AppShell>`

**Cron jobs:**
- Location: `src/app/api/cron/llm-jobs/route.ts` (every minute), `src/app/api/cron/recgon-schedule/route.ts` (daily 06:00 UTC)
- Triggers: Vercel cron configured in `vercel.json`
- Responsibilities: drain `llm_jobs`; mint recurring brain entries and dispatch

**MCP stdio server:**
- Location: `mcp-server/src/index.ts`
- Triggers: Claude Code spawning the binary over stdio
- Responsibilities: registers 4 tools (`list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`) and validates the token from `RECGON_MCP_TOKEN`

**Hosted MCP (HTTP):**
- Location: `src/app/api/mcp/route.ts` plus `authorize` / `register` / `token` siblings, and `.well-known/oauth-*`
- Triggers: external MCP clients (e.g. Claude.ai) over HTTP with OAuth bearer tokens
- Responsibilities: implements MCP JSON-RPC behind an OAuth 2.1 dance; bypasses edge CSRF/auth

## Architectural Constraints

- **Threading:** Vercel serverless Node functions — single-event-loop per invocation. Long work must be enqueued via `llm_jobs`; `vercel.json` raises `maxDuration` to 300s only for `/api/projects/[id]/analyze`, `/api/cron/llm-jobs`, and `/api/cron/recgon-schedule`.
- **Global state:** Two module-level singletons — `geminiClient` in `src/lib/llm/providers.ts` and `_client` in `src/lib/supabase.ts` (proxied so `import { supabase }` lazy-binds). The circuit breaker keeps a 10s in-process `closedCache` (`src/lib/llm/circuitBreaker.ts`); breaker writes are fire-and-forget.
- **Service-role key never reaches the client.** All Supabase access is server-side via `src/lib/supabase.ts`; no `NEXT_PUBLIC_SUPABASE_*` envs in code.
- **JWT-only sessions.** `src/auth.config.ts` sets `session: { strategy: 'jwt' }` — Supabase is not consulted during edge auth, keeping middleware fast.
- **Idempotency by design.** `llm_jobs` claims via `FOR UPDATE SKIP LOCKED`; `agent_tasks` minting uses unique partial index on `(team_id, kind, source_ref->>'dedupKey')`; `recgon-schedule` recurring entries embed an ISO week/day in their `dedupKey`.
- **Native-binary packages excluded from bundling.** `next.config.js` lists `@react-pdf/renderer`, `mammoth`, `pdf-parse`, `canvas`, `@modelcontextprotocol/sdk` in `serverExternalPackages`.

## Anti-Patterns

### Inlining prompts in route handlers or feature code

**What happens:** A developer drops a string template literal directly into a route or library module.
**Why it's wrong:** Prompts must stay versioned and reviewable together; otherwise eval scripts (`scripts/llm-eval.mjs`) and `PROMPT_VERSIONS` in `src/lib/llm/quality.ts` drift out of sync.
**Do this instead:** Add the prompt to `src/lib/prompts.ts` and import it; mirrors how `verify.ts` consumes `VERIFY_TASK_SYSTEM` / `verifyTaskUserPrompt`.

### Inlining Zod schemas at call sites

**What happens:** Defining a schema next to a `parseAIResponse` call.
**Why it's wrong:** Loses the central registry; tests under `src/__tests__/schemas.test.ts` won't cover it.
**Do this instead:** Add to `src/lib/schemas.ts` and import. See `ProofPayloadSchema`, `VerificationResultSchema` in `src/lib/recgon/verify.ts:18`.

### Calling Gemini/Anthropic SDKs directly from a route

**What happens:** Bypassing `chatViaChain` to call `getGeminiClient().getGenerativeModel(...)`.
**Why it's wrong:** Skips the circuit breaker, the Claude fallback, the retry/timeout layer, and the prompt-versioning hooks.
**Do this instead:** Use `chatViaChain` / `chatViaProviders` from `src/lib/llm/providers.ts`. Reserve `getGeminiClient()` for the chat route's function-calling loop, which still wraps with `withRetry`.

### Doing heavy LLM work synchronously inside a route

**What happens:** A handler awaits a full codebase analysis before returning.
**Why it's wrong:** Hits Vercel's request timeout; leaves the user staring at a spinner; loses retry semantics.
**Do this instead:** `enqueueJob(...)` and poll via `/api/llm/jobs/[id]`. The chat route is the deliberate exception (interactive, capped at `MAX_TOOL_ITERATIONS=5`).

### Reading another team's data because the URL had an id

**What happens:** Trusting `params.id` without re-checking team membership.
**Why it's wrong:** Edge middleware only checks "logged in," not "in this team." Cross-team access happens at the route layer.
**Do this instead:** Always `getUserTeams(session.user.id)` and assert the target `teamId` is in the result, as `src/app/api/chat/route.ts:35` does.

### Bundling native modules into the edge runtime

**What happens:** Importing `@react-pdf/renderer` or `pdf-parse` into edge-runtime code.
**Why it's wrong:** These rely on Node APIs; they break on the edge.
**Do this instead:** Keep such routes on `runtime = 'nodejs'`; the package is already in `serverExternalPackages` in `next.config.js`.

## Error Handling

**Strategy:** Routes catch and translate to JSON via `serverError()` (`src/lib/apiError.ts`); workers throw to let `failJob()` retry; LLM utilities classify with `isOverloaded` / `isRateLimited` (`src/lib/llm/utils.ts`) so the chain can decide between retry and fallback.

**Patterns:**
- API routes return `{ error: string }` JSON with appropriate status codes (`401`, `403`, `404`, `429`, `500`).
- LLM calls wrap every attempt with `withRetry` + `withTimeout` and feed outcomes back to the circuit breaker.
- Breaker is fail-open: any error inside `shouldTry` returns `true` so a degraded breaker doesn't black-hole working providers.
- Validation errors surface from `parseAIResponse` (Zod) and bubble up as worker failures, which retry up to `max_attempts` then mark `dead`.

## Cross-Cutting Concerns

**Logging:** `src/lib/logger.ts` — level-aware (`LOG_LEVEL` env, default `info`); structured `{ msg, ...fields }` objects. Used throughout `src/lib/recgon/**`, workers, and cron handlers.

**Validation:** Zod schemas in `src/lib/schemas.ts`; LLM outputs parsed via `parseAIResponse(schema, raw)`; request bodies validated inline in routes.

**Authentication:** NextAuth v5 JWT (`src/auth.ts`, `src/auth.config.ts`). MCP HTTP endpoints (`/api/mcp/**`) use bearer tokens stored via `src/lib/mcpTokenStorage.ts`; stdio MCP uses static token in `mcp-server/src/auth.ts`.

**Rate limiting:** `src/lib/rateLimit.ts` (token-bucket in Supabase) plus per-user `analysisQuota` (`src/lib/analysisQuota.ts`) for expensive AI analyses.

**Notifications:** `src/lib/notifications.ts` (`notifyTeammateAssigned`) plus transactional email via `src/lib/email.ts` (Resend).

**Activity log:** `src/lib/activityLog.ts` writes user-visible events surfaced in overview / chat-context prompts.

---

*Architecture analysis: 2026-05-10*
