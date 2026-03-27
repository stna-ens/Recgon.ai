# CLAUDE.md

## Commands
- `npm run dev` — dev server at localhost:3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — vitest

## Env (`.env.local`)
Required: `GEMINI_API_KEY`, `AUTH_SECRET`
Optional (GA4 OAuth): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Stack
Next.js 15 (App Router) + TypeScript + Tailwind. AI via Gemini 2.5 Flash (`@google/generative-ai`). Auth via NextAuth v5 (credentials + JWT). No database — flat-file JSON in `data/`.

## File map

### Auth
- `src/auth.ts` — NextAuth config
- `src/middleware.ts` — route protection (public: `/login`, `/register`, `/landing`, `/api/auth/**`)
- `src/lib/userStorage.ts` — user CRUD → `data/users.json`

### Data
- `src/lib/storage.ts` — `Project` type + CRUD → `data/projects.json`, scoped by `userId`
- `src/lib/fileLock.ts` — in-process mutex for JSON writes
- `src/lib/chatStorage.ts` — mentor chat history
- `src/lib/analyticsStorage.ts` — per-user GA4 property + OAuth tokens

### AI (all prompts in `src/lib/prompts.ts`, all schemas in `src/lib/schemas.ts`)
- `src/lib/gemini.ts` — Gemini wrapper, always JSON response mode
- `src/lib/codeAnalyzer.ts` — walks codebase, sends top files to Gemini
- `src/lib/contentGenerator.ts` — marketing content (Instagram/TikTok/Google Ads)
- `src/lib/feedbackEngine.ts` — feedback → sentiment + dev prompts
- `src/lib/analyticsEngine.ts` — GA4 Data API fetcher (6 parallel reports)

### API routes (`src/app/api/`)
- `projects/` — CRUD + `[id]/analyze` (codebase analysis)
- `marketing/generate` + `marketing/campaign` — content + campaign plans
- `feedback/analyze` — feedback analysis
- `analytics/data` + `analytics/analyze` — GA4 data + AI insights
- `analytics/oauth/` + `analytics/oauth/callback/` — Google OAuth flow
- `chat/` — mentor chatbot (streaming, persists history)

### Pages (`src/app/`)
`page.tsx` (dashboard) · `landing/` · `login/` · `register/` · `account/` · `projects/[id]/` + `export/` · `marketing/` · `feedback/` · `analytics/`

### Components (`src/components/`)
`AppShell.tsx` (layout) · `Sidebar.tsx` (nav+theme) · `Toast.tsx` (`useToast()` hook) · `ProjectCard.tsx` · `FeedbackPanel.tsx` · `MarketingPreview.tsx` · `StatsCard.tsx` · `Select.tsx` · `RecgonLogo.tsx` · `ErrorBoundary.tsx` · `ThemeProvider.tsx`

### MCP Server (`mcp-server/`)
- `mcp-server/src/index.ts` — entry point, stdio transport
- `mcp-server/src/tools.ts` — 4 tools: `list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`
- `mcp-server/src/data.ts` — reads/writes `data/projects.json` directly
- `mcp-server/src/types.ts` — mirrors `storage.ts` types + `CompletedPrompt`
- `mcp-server/src/auth.ts` — token validation via `RECGON_MCP_TOKEN` env var

## MCP Servers (plugins)
- **Recgon** — exposes project analyses to Claude Code. Tools: `list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`. Token auth via `RECGON_MCP_TOKEN`.
- **Context7** — live documentation lookup for libraries (Next.js, Zod, NextAuth, etc.). Use before writing code with newer APIs.
- **GitHub** — direct PR/issue management. Requires one-time auth via `/mcp` command.
- **Supabase** — database management. Requires access token from supabase.com dashboard (Settings > API).

## Key rules
- No database — flat-file JSON in `data/`, all writes through `fileLock.ts` mutex
- All prompts in `prompts.ts`, all schemas in `schemas.ts` — never inline
- Tests in `src/__tests__/` (vitest, globals enabled, `@` → `./src`)
- Detailed conventions auto-load from `.claude/rules/` when editing relevant files
