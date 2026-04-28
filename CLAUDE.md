# CLAUDE.md

## Commands
- `npm run dev` — dev server at localhost:3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — vitest

## Env (`.env.local`)
Required: `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
Optional (GA4 OAuth): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Stack
Next.js 15 (App Router) + TypeScript + Tailwind. AI via Gemini 2.5 Flash (`@google/generative-ai`). Auth via NextAuth v5 (credentials + JWT). Database: Supabase (PostgreSQL), accessed via service-role key server-side.

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
- `src/lib/gemini.ts` — Gemini wrapper, always JSON response mode
- `src/lib/codeAnalyzer.ts` — walks codebase, sends top files to Gemini
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
