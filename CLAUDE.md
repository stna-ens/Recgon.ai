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
- Feedback scraping + Recgon `web_fetch` verification source: `FIRECRAWL_API_KEY`
- Instagram Graph API (Recgon `instagram_graph` verification source + OAuth): `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`
- Deployment base URL (for emails + OAuth callbacks): `NEXT_PUBLIC_BASE_URL`
- Logging: `LOG_LEVEL` (`debug` | `info` | `warn` | `error`; default `info`)
- Quota bypass (comma-separated emails exempt from analysis quota): `QUOTA_EXEMPT_EMAILS`
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
- `src/lib/storage.ts` — `Project` type + CRUD → Supabase tables (`projects`, `project_analyses`, `marketing_content`, `feedback_analyses`, `campaigns`), scoped by `teamId`
- `src/lib/teamStorage.ts` — team CRUD, membership, invitations, access verification → Supabase tables (`teams`, `team_members`, `team_invitations`)
- `src/lib/chatStorage.ts` — mentor chat history → Supabase `chat_messages` table
- `src/lib/analyticsStorage.ts` — per-user GA4 property + OAuth tokens → Supabase `analytics_configs` table
- `src/lib/analysisQuota.ts` — per-user analysis quota enforcement (3 total, 1 per 2 weeks) → Supabase `analysis_quotas` table

### AI (all prompts in `src/lib/prompts.ts`, all schemas in `src/lib/schemas.ts`)
- `src/lib/llm/providers.ts` — `LLMProvider` interface, Gemini + Claude adapters, `chatViaChain()` / `chatViaProviders()` cross-provider fallback, `chatHedged()` opt-in adaptive hedging for interactive non-streaming calls
- `src/lib/llm/utils.ts` — shared `withRetry`, `withTimeout`, overload/rate-limit detection
- `src/lib/llm/circuitBreaker.ts` — shared Supabase-backed breaker (`llm_health` table): `shouldTry` / `recordSuccess` / `recordFailure`. 5 failures in 30s opens for 60s; fail-open on breaker errors; 10s in-process cache for happy path
- `src/lib/llm/jobQueue.ts` — persistent queue (`llm_jobs` table) for batch LLM work: `enqueueJob`, `claimNextJob`, `completeJob`, `failJob` (exponential backoff, ~7.5h retry horizon), `releaseStuckJobs`
- `src/lib/llm/workers.ts` — per-kind workers. Wired: `feedback_analysis`, `idea_analysis`, `codebase_analysis` (GitHub-backed only; local-path projects still fail inline), `competitor_analysis`
- `src/lib/gemini.ts` — thin facade re-exporting `chat`, `getGeminiClient`, `withRetry` for historical callers
- `src/lib/codeAnalyzer.ts` — walks codebase, sends top files to the LLM chain
- `src/lib/contentGenerator.ts` — marketing content (Instagram/TikTok/Google Ads)
- `src/lib/feedbackEngine.ts` — feedback → sentiment + dev prompts
- `src/lib/analyticsEngine.ts` — GA4 Data API fetcher (6 parallel reports)

### API routes (`src/app/api/`)
- `projects/` — CRUD + `[id]/analyze` (codebase analysis) — all require `teamId`
- `teams/` — team CRUD, members, invitations
- `marketing/generate` + `marketing/campaign` — content + campaign plans
- `feedback/analyze` — feedback analysis
- `analytics/data` + `analytics/analyze` — GA4 data + AI insights
- `analytics/oauth/` + `analytics/oauth/callback/` — Google OAuth flow
- `chat/` — mentor chatbot (streaming, persists history)
- `llm/jobs/[id]/` — GET status of a queued LLM job (team-access-checked)
- `cron/llm-jobs/` — Vercel cron (every minute) draining `llm_jobs`; `CRON_SECRET` bearer auth

### Pages (`src/app/`)
`page.tsx` (dashboard) · `landing/` · `login/` · `register/` · `account/` · `projects/[id]/` + `export/` · `marketing/` · `feedback/` · `analytics/` · `teams/` · `teams/setup/` · `teams/[id]/` · `teams/invite/[token]/`

### Components (`src/components/`)
`AppShell.tsx` (layout + TeamProvider) · `Sidebar.tsx` (nav+theme+team switcher) · `TeamProvider.tsx` (team context) · `TeamSwitcher.tsx` (team dropdown) · `Toast.tsx` (`useToast()` hook) · `ProjectCard.tsx` · `FeedbackPanel.tsx` · `MarketingPreview.tsx` · `StatsCard.tsx` · `Select.tsx` · `RecgonLogo.tsx` · `ErrorBoundary.tsx` · `ThemeProvider.tsx`

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

## Key rules
- Database: Supabase (PostgreSQL), all access through `src/lib/supabase.ts` service-role client
- Team-based data model: projects belong to teams, users access via team membership (owner/member/viewer)
- All prompts in `prompts.ts`, all schemas in `schemas.ts` — never inline
- Tests in `src/__tests__/` (vitest, globals enabled, `@` → `./src`)
- Detailed conventions auto-load from `.claude/rules/` when editing relevant files

## Feedback page memory

### Product / UX constraints
- `/feedback` should feel like a dense product workspace, not a marketing page and not a decorative dashboard.
- Match the rest of the app’s vibe. Do not introduce a one-off visual language that breaks theme consistency or light/dark mode behavior.
- Avoid explanatory or self-referential UI copy. The page should not explain what the product is, how the page works, or what “workspace state” means unless strictly necessary.
- The summary and output area are the priority. Sources/history/manual tools are secondary support context.
- Hide add-source UI until the user explicitly chooses to add a source.
- History items need meaningful labels derived from analysis content, not generic labels like `Mixed`.
- Unsupported/unavailable sources may appear in menus with `coming soon`, but they must not be selectable as active collection targets.

### Summary requirements
- The feedback summary must be a real model-written summary, not a frontend-composed summary from `bugs` / `themes` / `sentiment`.
- If a page section looks like AI reasoning, it must actually come from the model output.
- The summary block should be a concise summary paragraph, not a cluster of mini-cards pretending to be insight.
- Older saved analyses may not have a real summary until re-run; new analyses should persist the model summary.

### Current implementation notes
- Feedback analysis now has a real `summary` field in the schema/prompt/storage pipeline.
- Relevant files:
  - `src/lib/schemas.ts`
  - `src/lib/prompts.ts`
  - `src/lib/feedbackEngine.ts`
  - `src/lib/storage.ts`
  - `src/app/api/feedback/analyze/route.ts`
  - `src/lib/llm/workers.ts`
  - `src/components/FeedbackPanel.tsx`
- Supabase migration for persisted summaries:
  - `supabase/migrations/20260423_feedback_summary.sql`
- Storage code is intentionally backward-compatible if the `summary` column is missing.

### Known source-collection problem: YouTube
- Current source collection is generic scraping via Firecrawl, not platform-native collection.
- For YouTube, the app does **not** use the YouTube API or comments API.
- Current path:
  - scrape public URL as markdown in `src/lib/firecrawl.ts`
  - extract text segments in `src/lib/feedbackWorkspace.ts`
  - score segments heuristically with regexes (`love`, `bug`, `issue`, `wish`, etc.)
- Actual test against `https://www.youtube.com/@OpenAI` returned mostly YouTube shell / error text, e.g.:
  - `Error 403 (Forbidden)`
  - `We're sorry, but you do not have access to this page`
  - `If playback doesn't begin shortly, try restarting your device`
  - `An error occurred while retrieving sharing information`
- Conclusion: YouTube feedback collection is currently low-confidence / misleading. It is not reliably extracting real user comments. Treat it as unreliable until there is a dedicated YouTube-specific collector/integration.

### Practical guardrails for future edits
- Do not fake intelligence in the UI.
- Do not present derived heuristics as if they are first-class AI output.
- If a source is unreliable, the UI should say so or downgrade it instead of implying trustworthy feedback collection.
- Prefer fewer, clearer sections over more cards.
- When in doubt, reduce chrome and prioritize scan speed.
