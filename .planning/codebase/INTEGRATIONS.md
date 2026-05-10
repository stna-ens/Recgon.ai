# External Integrations

**Analysis Date:** 2026-05-10

## APIs & External Services

**LLM providers:**
- Google Gemini (2.5 Flash + 2.5 Flash-Lite) — Primary LLM. Used for project analysis, marketing copy, analytics insights, chat, and codebase summarization.
  - SDK/Client: `@google/generative-ai` 0.24.1 via `getGeminiClient()` in `src/lib/llm/providers.ts`.
  - Model chain: `['gemini-2.5-flash', 'gemini-2.5-flash-lite']` with overload-based fallthrough.
  - Auth: `GEMINI_API_KEY` (required at boot).
  - Wrappers: retries via `withRetry`, timeout via `withTimeout` (`src/lib/llm/utils.ts`); Supabase-backed circuit breaker in `src/lib/llm/circuitBreaker.ts`.
- Anthropic Claude (Haiku 4.5) — Cross-provider fallback when Gemini fails or the circuit breaker is open.
  - SDK/Client: `@anthropic-ai/sdk` ^0.90.0 in `src/lib/llm/providers.ts` (`claudeProvider`).
  - Model chain: `['claude-haiku-4-5']`.
  - Auth: `ANTHROPIC_API_KEY` (optional but strongly recommended in production).
  - Composed via `chatViaChain()` / `chatViaProviders()` / `chatHedged()` in `src/lib/llm/providers.ts`.

**Analytics:**
- Google Analytics 4 (GA4 Data API) — Per-team metrics fetcher (`src/lib/analyticsEngine.ts`).
  - SDK/Client: `@google-analytics/data` ^5.2.1 (`BetaAnalyticsDataClient`), `google-auth-library` ^10.6.1 (`OAuth2Client`).
  - Auth: User-level OAuth2; tokens stored in Supabase `analytics_configs` table via `src/lib/analyticsStorage.ts`. Refresh hits `https://oauth2.googleapis.com/token`.
  - OAuth dance: `src/app/api/analytics/oauth/route.ts` (initiate, scope `https://www.googleapis.com/auth/analytics.readonly`) + `src/app/api/analytics/oauth/callback/route.ts` (token exchange).
  - Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Vercel Analytics — Front-end pageview/event tag.
  - SDK/Client: `@vercel/analytics` ^2.0.1, mounted in `src/app/layout.tsx`.
  - Auth: None (Vercel-managed).

**Source control / code import:**
- GitHub REST API (`https://api.github.com`) — Repo metadata and zipball downloads for codebase analysis.
  - Used in `src/lib/githubFetcher.ts` (commits, compare, zipball), `src/lib/storage.ts` (repo metadata for project ingestion).
  - Auth: Per-user OAuth access token stored on `users.github_access_token`; falls back to anonymous (rate-limited) requests when absent.
  - Connect-only flow (separate from sign-in): `src/app/api/github/connect/route.ts` + `src/app/api/github/connect/callback/route.ts`. Env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (legacy `GITHUB_ID`, `GITHUB_SECRET` accepted).
  - Repo listing/status: `src/app/api/github/repos/route.ts`, `src/app/api/github/status/route.ts`.

**Web scraping / verification:**
- Firecrawl (`https://api.firecrawl.dev/v1/scrape`) — Site scraping for the `web_fetch` task-verification source and competitor research.
  - Caller: `src/lib/firecrawl.ts` (`scrapeWebsite`). Markdown format, 8KB cap, 15s timeout.
  - Auth: `FIRECRAWL_API_KEY` (Bearer). When unset, `scrapeWebsite` returns `null` (caller must degrade gracefully).

**Social / verification:**
- Instagram Graph API (`https://graph.facebook.com/v22.0`) — Media listing and OAuth via Meta.
  - Caller: `src/lib/instagramGraph.ts`. OAuth dialog at `https://www.facebook.com/v22.0/dialog/oauth`.
  - Routes: `src/app/api/integrations/instagram/connect/route.ts`, `callback/route.ts`, `disconnect/route.ts`.
  - Auth: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`. Tokens persisted per project via `src/lib/integrationStorage.ts`.

**Email:**
- Resend — Transactional email for registration OTP and team invitations.
  - SDK/Client: `resend` ^6.10.0 in `src/lib/email.ts`.
  - From address: `Recgon <noreply@recgon.app>`.
  - Auth: `RESEND_API_KEY`.
  - Trigger routes: `src/app/api/auth/send-otp/route.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/teams/[id]/invite/route.ts`.

## Data Storage

**Databases:**
- Supabase (PostgreSQL, managed) — Sole application database.
  - Connection: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service-role; **server-only**).
  - Client: `@supabase/supabase-js` ^2.101.0 — singleton + proxy in `src/lib/supabase.ts` (`getSupabase()` and `supabase` proxy).
  - Migrations: `supabase/migrations/` (current, 26 files from 2026-04-03 → 2026-05-10) plus legacy `supabase-migrations/` (6 files) and `supabase-schema.sql` baseline.
  - Notable tables: `users`, `teams`, `team_members`, `team_invitations`, `projects`, `project_analyses`, `marketing_content`, `campaigns`, `chat_messages`, `chat_conversations`, `analytics_configs`, `analytics_insights`, `analysis_quotas`, `llm_jobs`, `llm_health`, `project_integrations`, `task_*`, `activities`, `commit_summaries`, `registration_waitlist`, `user_feedback`.
  - Access pattern: every CRUD path goes through `src/lib/supabase.ts`; team-scoped queries enforced in `src/lib/storage.ts`, `src/lib/teamStorage.ts`, etc.

**File Storage:**
- Supabase Storage — Avatars (`/api/account/avatar`, `/api/teams/[id]/avatar`), task proof uploads (`/api/teams/[id]/tasks/[taskId]/proof/upload`), project logos.
- Local filesystem — Used transiently for GitHub zipball extraction in `src/lib/githubFetcher.ts` (writes to `os.tmpdir()`); no persistent local storage.

**Caching:**
- In-process: 10-second happy-path cache in the LLM circuit breaker (`src/lib/llm/circuitBreaker.ts`).
- No Redis / external cache.

## Authentication & Identity

**Auth Provider:**
- NextAuth v5 (`5.0.0-beta.30`) — `src/auth.ts` + `src/auth.config.ts` + `src/app/api/auth/[...nextauth]/route.ts`.
  - Session strategy: JWT (no DB session table).
  - Required: `AUTH_SECRET` (JWT signing). `AUTH_URL` recommended on Vercel.
  - Route protection: `src/middleware.ts` (public paths: `/login`, `/register`, `/landing`, `/teams/setup`, `/teams/invite/**`, `/api/auth/**`).

**Providers:**
- Credentials — Email + bcryptjs-hashed password. User CRUD in `src/lib/userStorage.ts` against the `users` table.
- GitHub OAuth — Conditionally registered when `GITHUB_CLIENT_ID` (or legacy `GITHUB_ID`) + secret are set. Scope: `read:user user:email public_repo` (intentionally no private-repo scope).
- Email OTP — Pre-registration verification via `/api/auth/send-otp` → Resend → `/api/auth/register`.

**MCP token auth (separate from NextAuth):**
- Personal access tokens stored via `src/lib/mcpTokenStorage.ts`; verified by `validateAccessToken()` in `src/app/api/mcp/route.ts`.
- OAuth-style discovery endpoints: `/api/mcp/authorize`, `/api/mcp/register`, `/api/mcp/token` (RFC 9728 `WWW-Authenticate` header pointing at `/.well-known/oauth-protected-resource`).
- Stdio MCP server (`mcp-server/`) uses a single shared bearer: `RECGON_MCP_TOKEN` (validated in `mcp-server/src/auth.ts`).

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry / Datadog / Bugsnag wiring in `src/` or `package.json`.

**Logs:**
- Custom JSON logger in `src/lib/logger.ts`. Level configurable via `LOG_LEVEL` (`debug` | `info` | `warn` | `error`; default `info`). Writes to `console.log` / `console.error` — picked up by Vercel function logs in production.

**Metrics:**
- `@vercel/analytics` page/event tracking only.

## CI/CD & Deployment

**Hosting:**
- Vercel — Sole deployment target. `vercel.json` pins per-route `maxDuration` (analyze: 300s; pdf/chat/marketing/analytics: 60s; cron: 300s) and registers cron jobs.
- Host redirect: `www.recgon.app → recgon.app` (permanent) in `vercel.json`.

**CI Pipeline:**
- None checked into the repo (no `.github/workflows/`, no `.circleci/`, etc.). `npm run validate` (`lint && test && build`) is the recommended local gate.

## Environment Configuration

**Required env vars:**
- `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (registration OTP).

**Production-critical:**
- `ANTHROPIC_API_KEY` (Claude fallback), `CRON_SECRET` (Vercel cron bearer), `AUTH_URL` and/or `NEXT_PUBLIC_BASE_URL` (callback URLs and email links).

**Optional integrations:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (GA4 OAuth).
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (NextAuth + repo import) — legacy aliases `GITHUB_ID`, `GITHUB_SECRET` still accepted by `src/auth.ts`.
- `FIRECRAWL_API_KEY` (site scraping + `web_fetch` verification).
- `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` (Instagram Graph + OAuth).
- `LOG_LEVEL` (logger threshold).
- `QUOTA_EXEMPT_EMAILS` (comma-separated emails exempt from analysis quota in `src/lib/analysisQuota.ts`).
- `WAITLIST_ADMIN_EMAILS` (admins allowed to approve waitlist entries; used by `src/lib/waitlist.ts` and `/api/admin/waitlist`).
- `NEXT_PUBLIC_APP_URL` (MCP base URL fallback in `src/app/api/mcp/route.ts`).
- `RECGON_MCP_TOKEN` (stdio MCP server bearer; see `mcp-server/src/auth.ts`).

**Secrets location:**
- Local: `.env.local` (gitignored; never read or quoted).
- Production: Vercel Environment Variables (per environment).
- No `.env.example` committed; the canonical reference is `CLAUDE.md` (env section) plus `src/lib/env.ts`.

## Webhooks & Callbacks

**Incoming:**
- `GET /api/cron/llm-jobs` — Vercel cron (per `vercel.json`, schedule `0 0 * * *`; comments and code suggest a one-minute cadence is the intended target). Drains the `llm_jobs` queue. Auth: `Authorization: Bearer ${CRON_SECRET}` (skipped in non-production).
- `GET /api/cron/recgon-schedule` — Vercel cron (`0 6 * * *`). Same `CRON_SECRET` guard pattern.
- `GET /api/auth/callback/github` — NextAuth sign-in + custom account-linking flow (`src/app/api/auth/callback/github/route.ts`).
- `GET /api/analytics/oauth/callback` — Google OAuth2 redirect URI for GA4.
- `GET /api/integrations/instagram/callback` — Meta OAuth redirect for Instagram Graph.
- `POST/GET /api/mcp` — Streamable HTTP MCP transport for remote Claude clients (bearer token auth via `mcpTokenStorage`).
- `GET|POST /api/mcp/authorize`, `/api/mcp/register`, `/api/mcp/token` — MCP OAuth discovery and token issuance endpoints.

**Outgoing:**
- `POST https://oauth2.googleapis.com/token` — Google OAuth token refresh (`src/lib/analyticsEngine.ts:65`, `src/app/api/analytics/oauth/callback/route.ts:60`).
- `https://accounts.google.com/o/oauth2/v2/auth` — Google OAuth dialog (`src/app/api/analytics/oauth/route.ts:56`).
- `https://api.github.com/...` — Commits, compare, zipball, repo metadata (`src/lib/githubFetcher.ts`, `src/lib/storage.ts`).
- `https://api.firecrawl.dev/v1/scrape` — Site scraping (`src/lib/firecrawl.ts`).
- `https://graph.facebook.com/v22.0/...` — Instagram media + token exchange (`src/lib/instagramGraph.ts`).
- `https://www.facebook.com/v22.0/dialog/oauth` — Meta OAuth dialog (`src/lib/instagramGraph.ts`).
- Anthropic + Gemini API calls — routed through their respective SDKs (no raw URLs in code).
- Resend API — via `resend` SDK in `src/lib/email.ts`.

---

*Integration audit: 2026-05-10*
