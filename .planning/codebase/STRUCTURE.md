# Codebase Structure

**Analysis Date:** 2026-05-10

## Directory Layout

```
Recgon/
├── src/                          # Next.js 15 App Router source
│   ├── app/                      # Routes (pages + API)
│   │   ├── layout.tsx            # Root layout (providers, mesh bg)
│   │   ├── page.tsx              # Authenticated home (overview)
│   │   ├── api/                  # Route handlers
│   │   ├── landing/              # Public marketing page
│   │   ├── login/ register/      # Auth pages
│   │   ├── projects/[id]/        # Project workspace + nested routes
│   │   ├── teams/                # Team CRUD + setup + invite
│   │   ├── terminal/             # Mentor/terminal chat UI
│   │   ├── calendar/ tasks/      # AI-PM views
│   │   ├── analytics/            # (project-level lives under projects/[id]/analytics)
│   │   ├── account/ settings/    # User config
│   │   ├── mcp/                  # In-product MCP OAuth UI
│   │   ├── verify/               # Email verification
│   │   ├── .well-known/          # OAuth metadata for MCP
│   │   ├── opengraph-image.tsx   # Dynamic OG image
│   │   ├── robots.ts sitemap.ts  # SEO
│   │   └── globals.css           # Tailwind base
│   ├── components/               # React components
│   │   ├── AppShell.tsx          # Top-level layout switcher
│   │   ├── WorkspaceShell.tsx    # Authenticated chrome
│   │   ├── TeamProvider.tsx      # Current-team context
│   │   ├── TeamSwitcher.tsx      # Header team dropdown
│   │   ├── ThemeProvider.tsx     # Light/dark
│   │   ├── Toast.tsx             # useToast() hook
│   │   ├── ErrorBoundary.tsx
│   │   ├── Select.tsx RecgonLogo.tsx TaskStatusChip.tsx ProofDropZone.tsx
│   │   ├── landing/              # Marketing page sections + effects
│   │   ├── recgon/               # AI-PM admin panel
│   │   └── v2/                   # Active app UI (home, projects, calendar, terminal)
│   ├── lib/                      # Business logic (server-only)
│   │   ├── supabase.ts           # Service-role Postgres client
│   │   ├── storage.ts            # Project CRUD (team-scoped)
│   │   ├── teamStorage.ts        # Team/member/invite CRUD
│   │   ├── userStorage.ts        # User CRUD
│   │   ├── chatStorage.ts        # Conversations + messages
│   │   ├── analyticsStorage.ts   # GA4 config + tokens
│   │   ├── analyticsInsightsStorage.ts analyticsScope.ts
│   │   ├── integrationStorage.ts # Instagram / GitHub link state
│   │   ├── mcpTokenStorage.ts    # Hosted MCP OAuth tokens
│   │   ├── analysisQuota.ts rateLimit.ts # Per-user limits
│   │   ├── waitlist.ts           # Self-register gating
│   │   ├── activityLog.ts notifications.ts email.ts
│   │   ├── prompts.ts            # ALL LLM prompts (single source)
│   │   ├── schemas.ts            # ALL Zod schemas (single source)
│   │   ├── gemini.ts             # Thin facade for legacy callers
│   │   ├── llm/                  # Provider chain + queue + breaker
│   │   ├── recgon/               # AI Product Manager (dispatcher, brain, verify, scheduler…)
│   │   ├── tools/                # Gemini function-calling tools
│   │   ├── terminal/             # Slash-command parser
│   │   ├── codeAnalyzer.ts ideaAnalyzer.ts competitorAnalyzer.ts
│   │   ├── analyticsEngine.ts contentGenerator.ts
│   │   ├── githubFetcher.ts firecrawl.ts instagramGraph.ts
│   │   ├── commitSummary.ts sourceProfiles.ts strings.ts
│   │   ├── projectPdf.tsx        # PDF export (React-PDF)
│   │   ├── appContext.ts mcpTools.ts apiError.ts logger.ts env.ts
│   ├── __tests__/                # Vitest suites
│   │   └── fixtures/             # Test data
│   ├── types/
│   │   └── next-auth.d.ts        # Session type augmentation
│   ├── auth.ts                   # NextAuth v5 config (providers + callbacks)
│   ├── auth.config.ts            # Edge-safe JWT-only config
│   └── proxy.ts                  # Edge middleware (compiled to Next middleware)
├── mcp-server/                   # Separate Node package — stdio MCP server
│   ├── src/
│   │   ├── index.ts              # Entry (stdio transport)
│   │   ├── tools.ts              # 4 tools
│   │   ├── data.ts               # Supabase reads/writes
│   │   ├── auth.ts               # RECGON_MCP_TOKEN check
│   │   └── types.ts              # Mirrors storage.ts types
│   ├── package.json tsconfig.json
├── supabase/
│   └── migrations/               # 25 SQL migrations (YYYYMMDD_*.sql)
├── supabase-schema.sql           # Consolidated schema (reference)
├── scripts/
│   └── llm-eval.mjs              # Prompt/quality eval runner (npm run eval:llm)
├── public/                       # Static assets (favicon, preview html, logo)
├── .planning/codebase/           # GSD codebase maps (this directory)
├── .claude/                      # Project-local Claude config
│   ├── skills/                   # Loaded skill bundles (design, react, shadcn, …)
│   ├── hooks/                    # arch-update-reminder, session-start
│   └── settings.local.json
├── .agents/ .codex/              # Other agent runners
├── .github/                      # GitHub workflows + templates
├── .next/                        # Build output (generated)
├── node_modules/                 # Generated
├── package.json package-lock.json
├── tsconfig.json next.config.js  # TS + Next config (path alias @/* → src/*)
├── vercel.json                   # Function maxDuration + cron schedules
├── vitest.config.ts              # Vitest globals + alias
├── .eslintrc.json                # Lint rules
├── .env.local                    # Local secrets (gitignored)
├── .mcp.json                     # Local MCP server config
├── CLAUDE.md                     # Project instructions for Claude Code
├── architecture.md               # Long-form architecture narrative (legacy reference)
├── CODEX.md CODEX_ARCHITECTURE.md DESIGN.md monetization-plan.md
├── README.md
└── next-env.d.ts
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router — every page and API route
- Contains: `layout.tsx` / `page.tsx` per route, `api/**/route.ts` handlers
- Key files: `src/app/layout.tsx` (root providers), `src/app/page.tsx` (authenticated home), `src/app/landing/page.tsx`

**`src/app/api/`:**
- Purpose: HTTP route handlers (Node runtime by default)
- Contains: REST + SSE endpoints grouped by domain (`projects`, `teams`, `chat`, `analytics`, `marketing`, `overview`, `llm`, `cron`, `mcp`, `auth`, `integrations`, `github`, `social`, `calendar`, `tasks`, `inbox`, `account`, `admin`)
- Key files: `src/app/api/chat/route.ts` (tool-calling chat), `src/app/api/cron/llm-jobs/route.ts` (queue drain), `src/app/api/cron/recgon-schedule/route.ts` (daily AI-PM tick), `src/app/api/teams/[id]/recgon/dispatch/route.ts` (manual dispatch), `src/app/api/projects/[id]/analyze/route.ts` (codebase analysis enqueue)

**`src/components/`:**
- Purpose: React components — both shared chrome and feature UI
- Contains: top-level shells, primitives wrapping Radix, marketing-only `landing/`, AI-PM admin in `recgon/`, the active product UI in `v2/`
- Key files: `src/components/AppShell.tsx`, `src/components/WorkspaceShell.tsx`, `src/components/TeamProvider.tsx`, `src/components/v2/HomeBoard.tsx`, `src/components/v2/terminal/TerminalShell.tsx`

**`src/components/v2/`:**
- Purpose: Active product surface area (despite the "v2" prefix — `/v2/*` routes are 307'd to `/*` in `next.config.js`, but the components stay namespaced)
- Contains: `HomeBoard`, `HomeFocus`, `HomePortfolio`, `ProjectShell`, `TerminalShell`, calendar widgets in `calendar/`, analytics widgets in `projects/analytics/`, overview widgets in `projects/overview/`
- Key files: `src/components/v2/HomeBoard.tsx`, `src/components/v2/calendar/WeekCalendar.tsx`, `src/components/v2/projects/analytics/AnalyticsTiles.tsx`

**`src/components/landing/`:**
- Purpose: Marketing page only — never imported from authenticated routes
- Contains: `LandingV2Shell`, `HeroSection`, `PipelineDiagram`, `Aurora`, glass card primitives, mobile landing variant
- Key files: `src/components/landing/LandingV2Shell.tsx`, `src/components/landing/sections/HeroSection.tsx`

**`src/lib/`:**
- Purpose: Server-side business logic — never imported from client components
- Contains: storage modules, LLM orchestration, AI-PM domain, prompts, schemas, integrations
- Key files: `src/lib/supabase.ts`, `src/lib/storage.ts`, `src/lib/prompts.ts`, `src/lib/schemas.ts`

**`src/lib/llm/`:**
- Purpose: Provider abstraction + durable job queue
- Contains: `providers.ts` (Gemini + Claude adapters + chain), `circuitBreaker.ts`, `jobQueue.ts`, `workers.ts`, `quality.ts`, `utils.ts`
- Key files: `src/lib/llm/providers.ts`, `src/lib/llm/jobQueue.ts`, `src/lib/llm/workers.ts`

**`src/lib/recgon/`:**
- Purpose: AI Product Manager — turns project signals into assigned tasks
- Contains: `brain.ts`, `dispatcher.ts`, `taskMint.ts`, `match.ts`, `scheduler.ts`, `scheduled.ts`, `skillTagger.ts`, `verify.ts`, `evidenceRouter.ts`, `evidenceSources.ts`, `fitLearning.ts`, `learn.ts`, `storage.ts`, `types.ts`
- Key files: `src/lib/recgon/dispatcher.ts` (entry to the loop), `src/lib/recgon/brain.ts`, `src/lib/recgon/verify.ts`

**`src/lib/tools/`:**
- Purpose: Gemini function-calling tools used by `/api/chat`
- Contains: per-tool modules (`listProjects`, `getProjectDetails`, `analyzeCode`, `fetchAnalytics`, `generateContent`, `generateCampaign`), `registry.ts`, `runTool.ts`, `resolveProject.ts`, `types.ts`
- Key files: `src/lib/tools/registry.ts`, `src/lib/tools/runTool.ts`

**`src/lib/terminal/`:**
- Purpose: Slash-command parsing for the Terminal page
- Contains: `commands.ts` only
- Key files: `src/lib/terminal/commands.ts`

**`src/__tests__/`:**
- Purpose: Vitest test suites (globals enabled, `@` alias → `./src`)
- Contains: 16 `.test.ts` files covering job queue, providers, schemas, Recgon brain/dispatcher/scheduler/match/learn, terminal commands, waitlist, quota, rate limit, source profiles
- Key files: `src/__tests__/jobQueue.test.ts`, `src/__tests__/recgonBrain.test.ts`, `src/__tests__/unifiedBrain.test.ts`

**`mcp-server/`:**
- Purpose: Standalone stdio MCP server consumed by Claude Code locally
- Contains: own `package.json` and `tsconfig.json`; excluded from the main `tsconfig.json` `include`
- Key files: `mcp-server/src/index.ts`, `mcp-server/src/tools.ts`, `mcp-server/src/data.ts`

**`supabase/migrations/`:**
- Purpose: Forward-only SQL migrations (named `YYYYMMDD_purpose.sql`)
- Contains: 25 migrations from `20260403_rate_limits.sql` through `20260510_user_feedback.sql`
- Key files: `20260417_llm_jobs.sql` (queue), `20260418_llm_health.sql` (breaker), `20260426_recgon_admin.sql`, `20260428_task_verification.sql`

**`.planning/codebase/`:**
- Purpose: GSD-generated codebase maps consumed by future Claude runs
- Generated: Yes (by `/gsd-map-codebase`)
- Committed: Typically yes — they are the working spec

**`.claude/`:**
- Purpose: Project-local Claude Code config + skills
- Contains: `skills/` (design-md, react-components, shadcn, vercel-react-best-practices, high-end-visual-design, page-cro, form-cro, marketing-psychology, impeccable, find-skills, stitch-design-taste, design-taste-frontend, extract-design-system, next-cache-components), `hooks/`, `settings.local.json`, plus `worktrees/` from past detached work
- Generated: hooks/skills installed by tooling; `worktrees/` are scratch clones

**`scripts/`:**
- Purpose: One-off Node scripts (not bundled)
- Contains: `llm-eval.mjs` only — run via `npm run eval:llm`

## Key File Locations

**Entry Points:**
- `src/proxy.ts`: Edge middleware (auth + CSRF + mobile redirect)
- `src/auth.ts`: NextAuth provider config + `signIn` callback
- `src/app/layout.tsx`: Root HTML + global providers
- `src/app/page.tsx`: Authenticated home overview
- `mcp-server/src/index.ts`: Stdio MCP server entry

**Configuration:**
- `next.config.js`: Strict mode off, Turbopack root pin, `serverExternalPackages`, security headers, `/mentor` and `/v2/*` redirects
- `vercel.json`: Function `maxDuration` overrides and cron schedules (`/api/cron/llm-jobs` and `/api/cron/recgon-schedule`)
- `tsconfig.json`: `paths: { '@/*': ['./src/*'] }`, excludes `mcp-server`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler`
- `vitest.config.ts`: Globals, `@` alias
- `.eslintrc.json`: ESLint rules
- `src/lib/env.ts`: `validateBootEnv()` runs at NextAuth init

**Core Logic:**
- `src/lib/prompts.ts`: All LLM prompts (~30 exports)
- `src/lib/schemas.ts`: All Zod schemas (~28 exports)
- `src/lib/storage.ts`: `Project` CRUD
- `src/lib/llm/providers.ts`: Provider chain
- `src/lib/recgon/dispatcher.ts`: AI-PM loop entry

**Testing:**
- `src/__tests__/`: All Vitest suites
- `src/__tests__/fixtures/`: Shared test data
- Run: `npm run test` (vitest run) or `npm run test:watch`

## Naming Conventions

**Files:**
- React components → `PascalCase.tsx` (e.g. `WorkspaceShell.tsx`, `HomeBoard.tsx`)
- Library modules → `camelCase.ts` (e.g. `teamStorage.ts`, `evidenceRouter.ts`)
- Route segments → `kebab-case` or single lowercase word (e.g. `analysis-quota`, `recgon-schedule`, `help-feedback`)
- API route handlers → always `route.ts` inside the segment folder (Next.js requirement)
- Page files → `page.tsx`; layouts → `layout.tsx` (Next.js requirement)
- SQL migrations → `YYYYMMDD_snake_case.sql` (e.g. `20260428_task_verification.sql`)
- Test files → `<feature>.test.ts` inside `src/__tests__/`

**Directories:**
- Route folders → kebab-case (`teams-setup`, `help-feedback`) or single lowercase word
- Dynamic segments → `[param]` (e.g. `projects/[id]`, `teams/[id]/tasks/[taskId]`)
- Component groupings → lowercase singular topic (`landing/`, `v2/calendar/`, `v2/projects/analytics/`)
- Library subsystems → lowercase singular (`llm/`, `recgon/`, `tools/`, `terminal/`)

**Symbols inside files:**
- React component exports → `PascalCase`
- Functions and variables → `camelCase`
- Types and interfaces → `PascalCase` (e.g. `Project`, `LLMJob`, `BrainEntry`, `ScheduledMatch`)
- Constants → `UPPER_SNAKE_CASE` (e.g. `MAX_TOOL_ITERATIONS`, `GEMINI_MODEL_CHAIN`, `LOCAL_CACHE_MS`, `ACTIVE_NON_TERMINAL_STATUSES`)

## Where to Add New Code

**New page route:**
- Primary code: `src/app/<segment>/page.tsx` (+ `layout.tsx` if shared chrome)
- Public-by-middleware? Update the `isPublicPage` / `isAuthPage` allowlist in `src/proxy.ts`

**New API endpoint:**
- Primary code: `src/app/api/<segment>/route.ts`
- Always `export const dynamic = 'force-dynamic'` if it reads session
- Always call `auth()` and team-access check (see `src/app/api/chat/route.ts:32`)
- If long-running: enqueue via `src/lib/llm/jobQueue.ts` instead of awaiting inline
- If on a 60s+ path: add to `vercel.json` `functions` block

**New LLM-backed workflow:**
- Add prompt → `src/lib/prompts.ts`
- Add schema → `src/lib/schemas.ts`
- Add `JobKind` + worker → `src/lib/llm/jobQueue.ts` (type) and `src/lib/llm/workers.ts` (handler)
- Caller: `enqueueJob({ kind: 'your_kind', payload, teamId, userId })`

**New chat tool:**
- New file under `src/lib/tools/<name>.ts` exporting `{ name, description, parameters, execute }`
- Register in `src/lib/tools/registry.ts` `ALL_TOOLS`
- Optionally expose as `/cmd` in `src/lib/terminal/commands.ts`

**New AI-PM signal:**
- Reader in `src/lib/recgon/brain.ts` producing `BrainEntry[]` with stable `dedupKey`
- Recurring? Add to `src/lib/recgon/scheduled.ts` with ISO week/day in `dedupKey`
- New evidence source? Add to `src/lib/recgon/evidenceSources.ts` and register in `evidenceRouter.ts`

**New Supabase table or column:**
- New migration: `supabase/migrations/YYYYMMDD_purpose.sql`
- Update consolidated `supabase-schema.sql` for reference
- Storage module: extend the relevant `src/lib/<domain>Storage.ts`

**New React component:**
- Shared chrome → `src/components/<Name>.tsx`
- Feature UI → `src/components/v2/<feature>/<Name>.tsx`
- Marketing only → `src/components/landing/<Name>.tsx`
- Always reach for Radix primitives (`@radix-ui/react-*`) and `@radix-ui/themes` before hand-rolling

**Utilities / helpers:**
- Domain-specific → inside the relevant `src/lib/<domain>/` folder
- Generic → top-level `src/lib/<name>.ts` (e.g. `strings.ts`, `apiError.ts`)

## Special Directories

**`.next/`:**
- Purpose: Next.js build artifacts
- Generated: Yes
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No

**`.vercel/`:**
- Purpose: Vercel CLI link state
- Generated: Yes
- Committed: No (gitignored)

**`.playwright-mcp/`:**
- Purpose: Screenshots captured by Playwright MCP
- Generated: Yes
- Committed: No

**`.claude/worktrees/`:**
- Purpose: Detached git worktrees used by past Claude Code sessions
- Generated: Yes
- Committed: No (each contains its own `.git`)

**`Recgon/` (top-level subdir):**
- Purpose: Legacy nested copy / scratch — not part of the active build
- Generated: No (predates current structure)
- Committed: Yes (kept for now)

---

*Structure analysis: 2026-05-10*
