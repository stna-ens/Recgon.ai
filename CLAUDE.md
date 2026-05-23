# CLAUDE.md

## Commands
- `npm run dev` — dev server at localhost:3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — vitest

## Env (`.env.local`)
Required: `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
Recommended in production:
- `ANTHROPIC_API_KEY` — Claude Haiku fallback. Without it, Gemini outages cause user-visible failures.
- `CRON_SECRET` — bearer token that authenticates Vercel cron → `/api/cron/llm-jobs`. Local dev skips the check.
Optional:
- GA4 OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- GitHub OAuth (repo import): `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (or legacy `GITHUB_ID`)
- Site scraping + Recgon `web_fetch` verification source: `FIRECRAWL_API_KEY`
- Instagram Graph API (Recgon `instagram_graph` verification source + OAuth): `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`
- Deployment base URL (for emails + OAuth callbacks): `NEXT_PUBLIC_BASE_URL`
- Logging: `LOG_LEVEL` (`debug` | `info` | `warn` | `error`; default `info`)
- Quota bypass (comma-separated emails exempt from analysis quota): `QUOTA_EXEMPT_EMAILS`
- Recgon dev-ops alert (Phase 3 / Plan 03-02 — receives one email per team per UTC day when the LLM judgment cap is hit): `DEV_OPS_ALERT_EMAIL`
- Judge bias regression (Phase 3 / Plan 03-04): `JUDGE_BIAS_REAL_LLM` — set to `1` to run `src/__tests__/judge.bias-regression.test.ts` against the real `chatViaProviders` chain (Gemini → Claude). Default unset = deterministic stub mode. Used by the nightly CI workflow `.github/workflows/judge-bias-nightly.yml` only; do not enable on every PR (cost: ~$0.30/run, latency: ~10 min).
- Why-you grounded bias regression (Phase 3 / Plan 03-05): `WHY_YOU_BIAS_REAL_LLM` — set to `1` to run `src/__tests__/whyYouLLM.bias-regression.test.ts` against the real `chatViaProviders` chain. Default unset = deterministic stub mode. Nightly only (cost: ~$0.05/run, latency: ~5 min). Mirrors `JUDGE_BIAS_REAL_LLM` env-gate pattern; do not enable on every PR.
- MCP server auth (stdio server only): `RECGON_MCP_TOKEN`

## Stack
Next.js 15 (App Router) + TypeScript + Tailwind. AI via multi-provider chain: Gemini 2.5 Flash (`@google/generative-ai`) with Claude Haiku 4.5 fallback (`@anthropic-ai/sdk`). Auth via NextAuth v5 (credentials + JWT). Database: Supabase (PostgreSQL), accessed via service-role key server-side.

## File map

### Auth
- `src/auth.ts` — NextAuth config
- `src/middleware.ts` — route protection (public: `/login`, `/register`, `/landing`, `/teams/setup`, `/teams/invite/**`, `/api/auth/**`)
- `src/lib/userStorage.ts` — user CRUD → Supabase `users` table

### Data
- `src/lib/supabase.ts` — Supabase client (service-role key, server-side only)
- `src/lib/storage.ts` — `Project` type + CRUD → Supabase tables (`projects`, `project_analyses`, `marketing_content`, `campaigns`), scoped by `teamId`
- `src/lib/teamStorage.ts` — team CRUD, membership, invitations, access verification → Supabase tables (`teams`, `team_members`, `team_invitations`)
- `src/lib/chatStorage.ts` — terminal/mentor chat history → Supabase `chat_messages` table
- `src/lib/terminal/commands.ts` — slash-command registry for `/v2/terminal` (parser + directive prompts that map to chat tools)
- `src/lib/analyticsStorage.ts` — per-user GA4 property + OAuth tokens → Supabase `analytics_configs` table
- `src/lib/analysisQuota.ts` — per-user analysis quota enforcement (3 total, 1 per 2 weeks) → Supabase `analysis_quotas` table

### AI (all prompts in `src/lib/prompts.ts`, all schemas in `src/lib/schemas.ts`)
- `src/lib/llm/providers.ts` — `LLMProvider` interface, Gemini + Claude adapters, `chatViaChain()` / `chatViaProviders()` cross-provider fallback, `chatHedged()` opt-in adaptive hedging for interactive non-streaming calls
- `src/lib/llm/utils.ts` — shared `withRetry`, `withTimeout`, overload/rate-limit detection
- `src/lib/llm/circuitBreaker.ts` — shared Supabase-backed breaker (`llm_health` table): `shouldTry` / `recordSuccess` / `recordFailure`. 5 failures in 30s opens for 60s; fail-open on breaker errors; 10s in-process cache for happy path
- `src/lib/llm/jobQueue.ts` — persistent queue (`llm_jobs` table) for batch LLM work: `enqueueJob`, `claimNextJob`, `completeJob`, `failJob` (exponential backoff, ~7.5h retry horizon), `releaseStuckJobs`
- `src/lib/llm/workers.ts` — per-kind workers. Wired: `idea_analysis`, `codebase_analysis` (GitHub-backed only; local-path projects still fail inline), `competitor_analysis`
- `src/lib/gemini.ts` — thin facade re-exporting `chat`, `getGeminiClient`, `withRetry` for historical callers
- `src/lib/codeAnalyzer.ts` — walks codebase, sends top files to the LLM chain
- `src/lib/contentGenerator.ts` — marketing content (Instagram/TikTok/Google Ads)
- `src/lib/analyticsEngine.ts` — GA4 Data API fetcher (6 parallel reports)

### API routes (`src/app/api/`)
- `projects/` — CRUD + `[id]/analyze` (codebase analysis) — all require `teamId`
- `teams/` — team CRUD, members, invitations
- `marketing/generate` + `marketing/campaign` — content + campaign plans
- `analytics/data` + `analytics/analyze` — GA4 data + AI insights
- `analytics/oauth/` + `analytics/oauth/callback/` — Google OAuth flow
- `chat/` — terminal chatbot (streaming, persists history) — backs `/v2/terminal` (formerly `/v2/mentor`, 307 redirect in `next.config.js`)
- `llm/jobs/[id]/` — GET status of a queued LLM job (team-access-checked)
- `cron/llm-jobs/` — Vercel cron draining `llm_jobs`; `CRON_SECRET` bearer auth. Schedule is `0 0 * * *` (daily at 00:00 UTC) because the project is on the Vercel Hobby plan, which disallows sub-daily crons. Implication: every queued job (task_reframe, commit_summary, teammate_task) can sit pending for up to 24h. Phase 4 personalized task descriptions therefore appear up to a day after assignment — accepted limitation, not a bug. Reconsider if/when the project moves to Vercel Pro.

### Pages (`src/app/`)
`page.tsx` (dashboard) · `landing/` · `login/` · `register/` · `account/` · `projects/[id]/` + `export/` · `marketing/` · `analytics/` · `teams/` · `teams/setup/` · `teams/[id]/` · `teams/invite/[token]/`

### Components (`src/components/`)
`AppShell.tsx` (layout + TeamProvider) · `WorkspaceShell.tsx` · `TeamProvider.tsx` (team context) · `TeamSwitcher.tsx` (team dropdown) · `Toast.tsx` (`useToast()` hook) · `Select.tsx` · `RecgonLogo.tsx` · `ErrorBoundary.tsx` · `ThemeProvider.tsx`

### MCP Server (`mcp-server/`)
- `mcp-server/src/index.ts` — entry point, stdio transport
- `mcp-server/src/tools.ts` — 4 tools: `list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`
- `mcp-server/src/data.ts` — reads/writes Supabase directly
- `mcp-server/src/types.ts` — mirrors `storage.ts` types + `CompletedPrompt`
- `mcp-server/src/auth.ts` — token validation via `RECGON_MCP_TOKEN` env var

## MCP Servers (plugins)
- **Recgon** — exposes project analyses to Claude Code. Tools: `list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`. Token auth via `RECGON_MCP_TOKEN`.
- **Context7** — live documentation lookup for libraries (Next.js, Zod, NextAuth, etc.). Use before writing code with newer APIs.
- **GitHub** — direct PR/issue management. Requires one-time auth via `/mcp` command.
- **Supabase** — database management. Requires access token from supabase.com dashboard (Settings > API).

## UI Components
- Use **Radix UI primitives** (`@radix-ui/react-*`) for all interactive UI: dialogs, dropdowns, tooltips, popovers, tabs, selects, etc.
- Use **`@radix-ui/themes`** components (`Box`, `Flex`, `Text`, `Button`, `Card`, etc.) for layout and base elements when appropriate.
- Do not hand-roll accessible interactive components from scratch when a Radix primitive exists.

## Key rules
- Database: Supabase (PostgreSQL), all access through `src/lib/supabase.ts` service-role client
- Team-based data model: projects belong to teams, users access via team membership (owner/member/viewer)
- All prompts in `prompts.ts`, all schemas in `schemas.ts` — never inline
- Tests in `src/__tests__/` (vitest, globals enabled, `@` → `./src`)
- Detailed conventions auto-load from `.claude/rules/` when editing relevant files

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Recgon**

Recgon is an **AI Product Manager for small teams**. It ingests a team's projects (codebase, GitHub activity, GA4 analytics), maintains a model of each teammate's strengths and capacity, and autonomously mints + assigns tasks to the best-fit person at the right time. Teammates work; Recgon decides *what* to work on next and *who* should do it.

**Core Value:** **The right task gets to the right teammate at the right time, with reasoning the teammate can trust.** If everything else fails — landing pages, analytics dashboards, content generation — this one loop must work.

### Constraints

- **Tech stack**: Next.js 15 + TypeScript + Tailwind + Supabase — locked. No framework swaps in v3.
- **LLM costs**: Every LLM call costs money. Live-codebase analysis and LLM judgment overlay both add per-task LLM calls — design must keep per-task cost bounded (e.g. summarize before judging, cache profile inferences).
- **Backwards compatibility**: Existing tasks, teammates, and brain runs must continue working through v3 rollout. New fields are additive; old assignments don't break when LLM judgment overlay is introduced.
- **Vercel runtime**: Functions are stateless and time-bounded. Long-running analysis must go through the existing `llm_jobs` queue + cron drain, not synchronous request handlers.
- **Supabase as system of record**: All persistent state in PostgreSQL. No new databases / vector stores in v3 unless explicitly justified during planning.
- **Single dev**: One developer (eneskis). Roadmap should respect that — favor smaller phases over giant ones, even if individual phases ship slower.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Reference docs (load on demand)

Detailed codebase reference lives in `.planning/codebase/`. Read these only when relevant to the task:
- `STACK.md` — full dependency/version breakdown
- `CONVENTIONS.md` — naming, imports, error handling, LLM patterns
- `ARCHITECTURE.md` — components, layers, data flow, anti-patterns
- `STRUCTURE.md` · `TESTING.md` · `CONCERNS.md` · `INTEGRATIONS.md`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
<!-- Trimmed — see .planning/codebase/CONVENTIONS.md. Core non-negotiables live under "Key rules" above. -->
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
<!-- Trimmed — see .planning/codebase/ARCHITECTURE.md. The "File map" above covers day-to-day navigation. -->
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
<!-- Trimmed — skills auto-load via the harness. Browse `.claude/skills/` and `.agents/skills/` to see what's installed. -->
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
