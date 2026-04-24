# CODEX.md

Read this first. Only open `CODEX_ARCHITECTURE.md` when you need subsystem detail.

## What This Repo Is
- `Recgon` is a Next.js 16 / React 19 app for solo founders.
- Users create team-scoped projects from either a GitHub repo or a plain-text idea.
- The app stores product analyses, marketing content, campaign plans, feedback analyses, GA4 config, mentor chat history, activity logs, MCP tokens, queued LLM jobs, and provider health state.

## Fast Read Order
1. `src/auth.ts`
2. `src/auth.config.ts`
3. `src/proxy.ts`
4. `src/lib/storage.ts`
5. `src/lib/teamStorage.ts`
6. `src/lib/userStorage.ts`
7. `src/lib/gemini.ts`
8. `src/lib/llm/providers.ts`
9. `src/lib/llm/jobQueue.ts`
10. the relevant `src/app/api/**` route
11. the relevant `src/app/**/page.tsx`

## Core Invariants
- Team membership is the main tenancy boundary. Check it server-side.
- Projects are effectively `sourceType = 'github' | 'description'`; legacy `'codebase'` rows still exist.
- Hosted project creation no longer accepts arbitrary local paths. GitHub URLs or descriptions only.
- `getAllProjects()` / `getProject()` assemble related data from multiple tables, not just `projects`.
- Structured AI output lives behind `src/lib/prompts.ts` and `src/lib/schemas.ts`.
- Most non-streaming AI calls go through `src/lib/gemini.ts`, which now delegates to Gemini with Claude fallback.
- The mentor chat route is the exception: `src/app/api/chat/route.ts` uses Gemini directly for function calling.
- Feedback and analysis flows are inline-first, queue-on-recoverable-failure.
- Styling is custom CSS in `src/app/globals.css`; this repo does not use Tailwind.

## Main Runtime Surfaces
- Web app: `src/app/**`
- REST API: `src/app/api/**`
- HTTP MCP endpoint with OAuth/PKCE: `src/app/api/mcp/**`
- Internal chat tool layer: `src/lib/tools/**`
- Legacy stdio MCP server: `mcp-server/**`

## Most Important Files By Area
- Auth/session: `src/auth.ts`, `src/auth.config.ts`, `src/proxy.ts`, `src/types/next-auth.d.ts`
- Core data: `src/lib/storage.ts`, `src/lib/teamStorage.ts`, `src/lib/userStorage.ts`, `src/lib/supabase.ts`
- LLM infra: `src/lib/gemini.ts`, `src/lib/llm/providers.ts`, `src/lib/llm/utils.ts`, `src/lib/llm/circuitBreaker.ts`, `src/lib/llm/jobQueue.ts`, `src/lib/llm/workers.ts`
- Project analysis: `src/lib/codeAnalyzer.ts`, `src/lib/ideaAnalyzer.ts`, `src/lib/githubFetcher.ts`, `src/app/api/projects/[id]/analyze/route.ts`
- Feedback: `src/lib/feedbackEngine.ts`, `src/lib/feedbackWorkspace.ts`, `src/lib/sourceProfiles.ts`, `src/app/api/feedback/**`, `src/app/feedback/page.tsx`
- Marketing: `src/lib/contentGenerator.ts`, `src/app/api/marketing/**`, `src/app/marketing/page.tsx`
- Analytics: `src/lib/analyticsEngine.ts`, `src/lib/analyticsStorage.ts`, `src/app/api/analytics/**`, `src/app/analytics/page.tsx`
- Mentor/tooling: `src/app/api/chat/route.ts`, `src/lib/tools/**`, `src/lib/activityLog.ts`, `src/app/mentor/page.tsx`
- MCP: `src/app/api/mcp/**`, `src/lib/mcpTokenStorage.ts`, `src/lib/mcpTools.ts`, `mcp-server/**`

## Commands
- Root: `npm run dev`, `npm run build`, `npm run test`, `npm run validate`
- Legacy stdio MCP server: `cd mcp-server && npm run dev`

## Environment
- Required at runtime: `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Common optional: `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY`, `WAITLIST_ADMIN_EMAILS`, `QUOTA_EXEMPT_EMAILS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL`, `LOG_LEVEL`

## Known Seams Worth Remembering
- Request gating lives in `src/proxy.ts`; older docs may still call this middleware.
- `supabase-schema.sql` is only the bootstrap base. The real schema is `supabase-schema.sql` plus both migration folders: `supabase-migrations/` and `supabase/migrations/`.
- The current MCP surface is the OAuth-enabled HTTP endpoint in `src/app/api/mcp/**`; `mcp-server/` is an older parallel server and lags newer app behavior.
- `src/app/api/overview/route.ts` and `src/app/api/overview/brief/route.ts` still read `feedbackAnalyses.result.*`, but stored feedback analyses now expose `themes` and `developerPrompts` at the top level.
- `src/app/projects/[id]/page.tsx` handles SSE `progress` and `done`, but not backend `queued` events. `src/app/feedback/page.tsx` does handle queued jobs.
- Activity logging currently happens via `src/lib/tools/runTool.ts`; direct REST flows mostly bypass `activities`.

## When In Doubt
- Read `CODEX_ARCHITECTURE.md`.
- Then open only the subsystem files you are actively changing.
