# CODEX_ARCHITECTURE.md

Detailed reference for Codex. Read `CODEX.md` first and only load the sections you need.

## 1. Product + Stack

`Recgon` is a founder workflow app:
- ingest a GitHub repo or idea description
- generate a product/strategy analysis
- turn that into marketing content and campaign plans
- collect/analyze feedback
- connect GA4 and summarize analytics
- chat with a mentor that knows the team's projects
- expose stored project context through MCP

Primary stack:
- Next.js 16 App Router
- React 19
- TypeScript
- NextAuth v5 beta with JWT sessions
- Supabase Postgres + Supabase Storage
- Gemini + Claude fallback for structured non-streaming calls
- Google Analytics Data API + Analytics Admin API
- GitHub REST API
- Firecrawl for site scraping
- Resend for OTP email
- Vitest for unit tests

This repo does not use Tailwind. UI styling is hand-authored in `src/app/globals.css`.

## 2. Top-Level Structure

### App
- `src/app/**`: pages, layouts, metadata routes, REST endpoints
- `src/components/**`: client shell, team context, UI widgets, landing components
- `src/lib/**`: storage, analysis engines, prompts/schemas, queueing, tool registry, integrations

### MCP
- `src/app/api/mcp/**`: current OAuth-enabled HTTP MCP endpoint
- `src/lib/mcpTokenStorage.ts`: auth codes + access tokens
- `src/lib/mcpTools.ts`: project-analysis MCP tools for the HTTP endpoint
- `mcp-server/**`: older standalone stdio MCP server with separate package.json and direct Supabase reads

### Database
- `supabase-schema.sql`: base bootstrap schema only
- `supabase-migrations/**`: older migration set
- `supabase/migrations/**`: newer migration set

Important: the real schema is the base file plus both migration folders.

## 3. Runtime Boundaries

### 3.1 Auth + Request Gate
- `src/auth.ts`: NextAuth setup
- `src/auth.config.ts`: JWT/session callbacks
- `src/proxy.ts`: route protection, same-origin CSRF check for mutating APIs, mobile redirect to `/landing`

Auth modes:
- credentials login
- GitHub OAuth for sign-in
- separate GitHub OAuth flow for account linking / repo import token

Behavior notes:
- unauthenticated users get routed to `/landing` or `/login`
- `/teams/setup` and invite flows stay accessible to logged-in users without a team
- MCP routes bypass the normal CSRF gate

### 3.2 Team Scope
- `TeamProvider` is the client-side team anchor
- selected team is cached in `localStorage`
- the provider also caches project summaries and GitHub update flags
- almost every workspace page reads `currentTeam` from `TeamProvider`

### 3.3 Supabase Access Pattern
- `src/lib/supabase.ts` exposes a singleton service-role client
- app code uses service-role access server-side, so RLS is defense-in-depth
- most rows are keyed by `team_id`, `user_id`, or both

## 4. Core Data Model

### Identity / Access
- `users`
- `registration_waitlist`
- `teams`
- `team_members`
- `team_invitations`

### Projects
- `projects`
- `project_analyses`
- `marketing_content`
- `feedback_analyses`
- `campaigns`

### Chat / Analytics / Ops
- `chat_conversations`
- `chat_messages`
- `analytics_configs`
- `analysis_quotas`
- `quota_exceptions`
- `rate_limits`
- `activities`
- `llm_jobs`
- `llm_health`
- `mcp_auth_codes`
- `mcp_tokens`
- `email_verifications`

### Project Shape In Code
`src/lib/storage.ts` is the real read model. `Project` is assembled from:
- one `projects` row
- optional `project_analyses` row
- zero or more `marketing_content` rows
- zero or more `feedback_analyses` rows
- zero or more `campaigns` rows

Important project fields:
- `teamId`
- `createdBy`
- `sourceType`
- `description`
- `isGithub`
- `githubUrl`
- `lastAnalyzedCommitSha`
- `isShared`
- `socialProfiles`
- `analyticsPropertyId`

Important compatibility behavior in storage:
- fallback if `projects.is_shared` does not exist
- fallback if `feedback_analyses.summary` does not exist
- legacy `sourceType: 'codebase'` is still accepted on reads

### Schema Drift To Remember
- `supabase-schema.sql` still reflects older invitation and project assumptions
- later migrations add or change:
  - project privacy
  - link-only invites
  - waitlist
  - feedback summaries
  - activities
  - quota exceptions
  - llm queue
  - llm circuit breaker

## 5. Storage / Domain Modules

### Core Storage
- `src/lib/userStorage.ts`: user CRUD, OAuth updates, avatar URL, GitHub token
- `src/lib/teamStorage.ts`: team CRUD, roles, invitations, avatar metadata, access checks
- `src/lib/storage.ts`: projects and all attached artifacts
- `src/lib/chatStorage.ts`: mentor conversations + messages
- `src/lib/analyticsStorage.ts`: GA4 config and OAuth token persistence
- `src/lib/mcpTokenStorage.ts`: MCP PKCE auth codes + bearer tokens
- `src/lib/activityLog.ts`: tool execution log
- `src/lib/analysisQuota.ts`: 3 lifetime analyses, 14-day cooldown, optional email exemptions
- `src/lib/waitlist.ts`: registration waitlist flow

### Key Storage Invariants
- `verifyTeamAccess()` answers membership
- `verifyTeamWriteAccess()` limits write operations to owner/member
- `getProjectTeamId(projectId)` is used to derive team scope server-side
- private projects are visible only to creator when `is_shared = false`

## 6. AI / Analysis Architecture

### 6.1 LLM Facade
- `src/lib/gemini.ts` is the compatibility facade
- it now re-exports `chatViaProviders()` from `src/lib/llm/providers.ts`

Provider chain:
1. `gemini-2.5-flash`
2. `gemini-2.5-flash-lite`
3. `claude-haiku-4-5`

Shared helpers:
- `src/lib/llm/utils.ts`: timeout, retry, overload/rate-limit detection
- `src/lib/llm/circuitBreaker.ts`: Supabase-backed provider breaker using `llm_health`

Important exception:
- `src/app/api/chat/route.ts` uses Gemini directly because it needs Gemini function calling with tool declarations

### 6.2 Queue + Retry Layer
- `src/lib/llm/jobQueue.ts`: persistent queue API
- `src/lib/llm/workers.ts`: worker dispatch
- `src/app/api/cron/llm-jobs/route.ts`: cron drain
- `src/app/api/llm/jobs/[id]/route.ts`: job status polling

Job kinds:
- `feedback_analysis`
- `codebase_analysis`
- `competitor_analysis`
- `idea_analysis`

Pattern:
- try inline first
- if failure is recoverable (`503`, `529`, `429`, overload, quota, etc.), enqueue
- cron drains up to 3 jobs per minute

Frontend support:
- feedback page polls queued jobs
- project detail page does not currently handle SSE `queued` events from the analyze route

### 6.3 Prompt / Schema Discipline
- prompts: `src/lib/prompts.ts`
- schemas: `src/lib/schemas.ts`

Structured workflows should use those files instead of inline prompt/schema definitions.

## 7. Main Product Flows

### 7.1 Project Creation
Route: `src/app/api/projects/route.ts`

Two supported creation modes:
- description-only idea
- GitHub repo import

GitHub import:
- validates GitHub URL
- optionally uses linked GitHub token
- downloads repo zip via GitHub API
- extracts to temp dir
- stores temp `path` plus `githubUrl`

Local arbitrary filesystem paths are no longer supported in hosted flows.

### 7.2 Project Analysis
Primary files:
- `src/app/api/projects/[id]/analyze/route.ts`
- `src/lib/codeAnalyzer.ts`
- `src/lib/ideaAnalyzer.ts`
- `src/lib/githubFetcher.ts`
- `src/lib/competitorAnalyzer.ts`

Description flow:
- analyze text with `ANALYZE_IDEA_SYSTEM`

GitHub first-analysis flow:
- clone repo
- walk tree + read key files
- analyze via `ANALYZE_SYSTEM`
- save `lastAnalyzedCommitSha`

GitHub re-analysis flow:
- compare `lastAnalyzedCommitSha` with GitHub HEAD
- if diff exists, run `ANALYZE_UPDATE_SYSTEM`
- if diff unavailable, fall back to full clone + analyze

Transport:
- SSE stream with `progress`, `done`, `error`, and sometimes `queued`

Follow-up:
- competitor site analysis is best-effort after main save

### 7.3 Feedback
Core files:
- `src/lib/feedbackEngine.ts`
- `src/lib/feedbackWorkspace.ts`
- `src/lib/sourceProfiles.ts`
- `src/lib/feedbackContent.ts`

Routes:
- `src/app/api/feedback/analyze/route.ts`
- `src/app/api/feedback/history/route.ts`
- `src/app/api/feedback/collect/route.ts`
- `src/app/api/feedback/sources/discover/route.ts`

Two feedback modes:
- manual feedback array
- auto-collect from configured `socialProfiles`

Collection behavior:
- dedupe and normalize source URLs
- scrape pages through Firecrawl
- heuristically extract feedback-like sentences from markdown
- analyze with LLM

Current source status comes from `sourceProfiles.ts`:
- supported: X, YouTube, Reddit, Product Hunt, App Store, Google Play, Trustpilot, G2, Capterra, generic review/testimonial/community/web pages
- coming soon: Instagram, TikTok
- blocked: LinkedIn, Facebook

Important caveat:
- the UI and docs imply broader feedback collection than the implementation really has
- collection is mostly generic scrape + heuristics, not platform-native APIs
- YouTube is marked supported in source metadata, but it still goes through the same generic scrape pipeline, so treat it as low-confidence

### 7.4 Marketing + Campaigns
Core files:
- `src/lib/contentGenerator.ts`
- `src/app/api/marketing/generate/route.ts`
- `src/app/api/marketing/campaign/route.ts`
- `src/app/marketing/page.tsx`

Capabilities:
- Instagram/TikTok/Google Ads content generation
- full campaign plan generation
- optional website scraping through Firecrawl
- optional social profile analysis via `/api/social/analyze`

Persistence:
- generated content is appended to `marketing_content`
- campaigns are saved to `campaigns`

### 7.5 Analytics
Core files:
- `src/lib/analyticsStorage.ts`
- `src/lib/analyticsEngine.ts`
- `src/app/api/analytics/**`
- `src/app/analytics/page.tsx`

Auth modes:
- GA4 service account JSON
- Google OAuth

Route roles:
- `/api/analytics/property`: get/set global property or link a property to a project
- `/api/analytics/properties`: list available GA4 properties for OAuth users
- `/api/analytics/data`: fetch raw GA4 data
- `/api/analytics/analyze`: LLM summary over raw GA4 data
- `/api/analytics/oauth/*`: consent + callback

Engine behavior:
- fetches 6 reports in parallel: overview, daily trend, channels, pages, devices, countries
- refreshes OAuth token when near expiry

### 7.6 Mentor / Terminal
Core files:
- `src/app/mentor/page.tsx`
- `src/app/api/chat/route.ts`
- `src/lib/chatStorage.ts`
- `src/lib/tools/**`
- `src/lib/activityLog.ts`

Behavior:
- persistent conversation list per user
- plain-text streaming response
- Gemini function calling over internal tools
- tool output is written back into the model conversation
- chat attempts automatic conversation-to-project classification

Internal tools:
- `list_projects`
- `get_project_details`
- `analyze_code`
- `fetch_analytics`
- `query_feedback`
- `generate_content`

Important nuance:
- tool executions are what populate `activities`
- overview signals are therefore tied to tool use more than direct GUI REST use

## 8. API Map

### Auth / Account
- `/api/auth/[...nextauth]`
- `/api/auth/send-otp`
- `/api/auth/register`
- `/api/auth/callback/github`
- `/api/account`
- `/api/account/avatar`
- `/api/admin/waitlist`
- `/api/analysis-quota`

### Teams
- `/api/teams`
- `/api/teams/[id]`
- `/api/teams/[id]/members`
- `/api/teams/[id]/members/[userId]`
- `/api/teams/[id]/invite`
- `/api/teams/[id]/invitations`
- `/api/teams/invite/accept`
- `/api/teams/[id]/avatar`

### Projects
- `/api/projects`
- `/api/projects/[id]`
- `/api/projects/[id]/analyze`
- `/api/projects/[id]/check-updates`
- `/api/projects/[id]/pdf`
- `/api/projects/extract-text`

### Feedback
- `/api/feedback/analyze`
- `/api/feedback/history`
- `/api/feedback/collect`
- `/api/feedback/sources/discover`

### Marketing / Social
- `/api/marketing/generate`
- `/api/marketing/campaign`
- `/api/social/profiles`
- `/api/social/analyze`

### Analytics
- `/api/analytics/data`
- `/api/analytics/analyze`
- `/api/analytics/properties`
- `/api/analytics/property`
- `/api/analytics/oauth`
- `/api/analytics/oauth/callback`

### Mentor / Queue / Overview
- `/api/chat`
- `/api/chat/conversations`
- `/api/chat/conversations/[id]`
- `/api/llm/jobs/[id]`
- `/api/overview`
- `/api/overview/brief`
- `/api/overview/analytics`
- `/api/cron/llm-jobs`

### GitHub / MCP / Metadata
- `/api/github/connect`
- `/api/github/connect/callback`
- `/api/github/status`
- `/api/github/repos`
- `/api/mcp/authorize`
- `/api/mcp/token`
- `/api/mcp/register`
- `/api/mcp`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`

## 9. Page -> API Dependencies

### Workspace Pages
- `/`: `/api/projects`, `/api/overview`, `/api/overview/brief`, `/api/overview/analytics`
- `/projects`: `/api/projects`, `/api/github/repos`, `/api/projects/extract-text`
- `/projects/[id]`: `/api/projects/[id]`, `/api/projects/[id]/analyze`, `/api/projects/[id]/check-updates`, `/api/analysis-quota`
- `/projects/[id]/export`: `/api/projects/[id]`, `/api/projects/[id]/pdf`
- `/marketing`: `/api/projects`, `/api/social/profiles`, `/api/social/analyze`, `/api/marketing/generate`, `/api/marketing/campaign`
- `/feedback`: `/api/projects`, `/api/feedback/collect`, `/api/feedback/analyze`, `/api/feedback/sources/discover`, `/api/social/profiles`, `/api/llm/jobs/[id]`
- `/analytics`: `/api/projects`, `/api/analytics/property`, `/api/analytics/properties`, `/api/analytics/data`, `/api/analytics/analyze`
- `/mentor`: `/api/projects`, `/api/chat`, `/api/chat/conversations`, `/api/chat/conversations/[id]`

### Admin / Identity Pages
- `/teams`, `/teams/setup`, `/teams/[id]`, `/teams/invite/[token]`: `/api/teams*`
- `/account`: `/api/account`, `/api/account/avatar`, `/api/github/status`, `/api/github/connect`, `/api/admin/waitlist`
- `/login`, `/register`: auth routes above

### Marketing / Public Surfaces
- `/landing`: static marketing page with JSON-LD and hidden crawler-friendly content
- `/landing-demo`: large standalone demo surface using mock data only

## 10. MCP Surfaces

### Current HTTP MCP
Files:
- `src/app/api/mcp/route.ts`
- `src/lib/mcpTokenStorage.ts`
- `src/lib/mcpTools.ts`

Auth:
- OAuth 2.0 authorization code with PKCE
- dynamic client registration
- bearer tokens stored in Supabase

Scope model:
- request token resolves user
- user teams are loaded
- tools are registered against accessible team IDs

HTTP MCP tools:
- `list_projects`
- `get_project_analysis`
- `get_actionable_items`
- `mark_item_complete`

### Legacy Stdio MCP Server
Files:
- `mcp-server/src/index.ts`
- `mcp-server/src/tools.ts`
- `mcp-server/src/data.ts`
- `mcp-server/src/auth.ts`

Characteristics:
- separate npm package
- direct Supabase service-role reads
- env-based guard via `RECGON_MCP_TOKEN`
- no per-request team scoping
- code shape lags the app-integrated MCP path

Treat this as a parallel legacy server unless you are specifically working on it.

## 11. External Integrations

- GitHub:
  - sign-in provider in NextAuth
  - separate repo-scope account-linking flow
  - repo list
  - zip download
  - commit HEAD + compare
- Google:
  - OAuth consent for GA4
  - Analytics Admin API property listing
  - Analytics Data API reporting
- Firecrawl:
  - site/profile scraping to markdown
- Resend:
  - OTP email for registration

## 12. Security / Ops Notes

- `next.config.js` adds security headers globally
- `src/proxy.ts` enforces same-origin for mutating API calls except MCP and NextAuth
- mobile user agents are redirected away from most app surfaces to `/landing`
- `vercel.json` sets long-running function durations and the cron schedule
- RLS is enabled and forced on most tenant tables, but the backend uses the service-role key

## 13. Tests

Test suite location: `src/__tests__/`

Current coverage is mostly unit-level logic:
- LLM provider failover
- backoff math
- schema parsing
- quota rules
- rate limit logic
- feedback/source heuristics
- waitlist helpers

What is not well covered:
- route handlers
- Supabase integration
- end-to-end queue flow
- mentor chat tool calling
- large page behavior

## 14. Known Mismatches / Legacy Seams

- `src/app/api/overview/route.ts` and `src/app/api/overview/brief/route.ts` still look for `feedbackAnalyses.result.*`, but `storage.ts` now exposes `developerPrompts` and `themes` directly on each feedback analysis.
- `src/app/projects/[id]/page.tsx` does not react to backend SSE `queued` events even though `/api/projects/[id]/analyze` can emit them.
- `src/app/api/github/connect/callback/route.ts` exists, but the active account-linking flow points GitHub back to `/api/auth/callback/github`.
- `mcp-server/**` and `src/app/api/mcp/**` implement similar concepts with different auth and scoping models.
- `supabase-schema.sql` is incomplete relative to migrations.
- Some older comments/docs still describe local codebase analysis as a first-class hosted flow; current project creation rejects non-GitHub paths.

## 15. If You Are Editing...

### Auth / onboarding
Read:
- `src/auth.ts`
- `src/auth.config.ts`
- `src/proxy.ts`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`
- `src/lib/waitlist.ts`

### Teams / access
Read:
- `src/components/TeamProvider.tsx`
- `src/lib/teamStorage.ts`
- `src/app/api/teams/**`
- `src/app/teams/**`

### Projects / analysis
Read:
- `src/lib/storage.ts`
- `src/lib/codeAnalyzer.ts`
- `src/lib/ideaAnalyzer.ts`
- `src/lib/githubFetcher.ts`
- `src/app/api/projects/**`
- `src/app/projects/**`

### Feedback
Read:
- `src/lib/feedbackEngine.ts`
- `src/lib/feedbackWorkspace.ts`
- `src/lib/sourceProfiles.ts`
- `src/app/api/feedback/**`
- `src/app/feedback/page.tsx`

### Mentor / tools
Read:
- `src/app/api/chat/route.ts`
- `src/lib/tools/**`
- `src/lib/activityLog.ts`
- `src/app/mentor/page.tsx`

### Analytics
Read:
- `src/lib/analyticsStorage.ts`
- `src/lib/analyticsEngine.ts`
- `src/app/api/analytics/**`
- `src/app/analytics/page.tsx`

### MCP
Read:
- `src/app/api/mcp/**`
- `src/lib/mcpTokenStorage.ts`
- `src/lib/mcpTools.ts`
- `mcp-server/**` only if you are intentionally touching the legacy stdio server
