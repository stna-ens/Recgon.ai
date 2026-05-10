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
- `cron/llm-jobs/` — Vercel cron (every minute) draining `llm_jobs`; `CRON_SECRET` bearer auth

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

- **Tech stack**: Next.js 15 + TypeScript + Tailwind + Supabase — locked. No framework swaps in v2.
- **LLM costs**: Every LLM call costs money. Live-codebase analysis and LLM judgment overlay both add per-task LLM calls — design must keep per-task cost bounded (e.g. summarize before judging, cache profile inferences).
- **Backwards compatibility**: Existing tasks, teammates, and brain runs must continue working through v2 rollout. New fields are additive; old assignments don't break when LLM judgment overlay is introduced.
- **Vercel runtime**: Functions are stateless and time-bounded. Long-running analysis must go through the existing `llm_jobs` queue + cron drain, not synchronous request handlers.
- **Supabase as system of record**: All persistent state in PostgreSQL. No new databases / vector stores in v2 unless explicitly justified during planning.
- **Single dev**: One developer (eneskis). Roadmap should respect that — favor smaller phases over giant ones, even if individual phases ship slower.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ^5.5.0 — All application source under `src/` and `mcp-server/src/`. `tsconfig.json` is `strict: true`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler`, JSX = `react-jsx`. Path alias `@/* → ./src/*`.
- JavaScript (CommonJS) — Build/config glue only: `next.config.js`, `scripts/llm-eval.mjs` (ESM script).
- SQL — Supabase migrations under `supabase/migrations/` and `supabase-migrations/`, plus baseline `supabase-schema.sql`.
- CSS — Tailwind utility classes plus hand-authored layers in `src/app/globals.css` and per-route stylesheets (e.g. `src/app/projects/[id]/overview.css`).
## Runtime
- Node.js — Next.js 16 / React 19 require Node 20+. No `.nvmrc` or `engines` field is present; the Vercel deployment target sets the runtime.
- API routes default to the Node.js runtime; `src/app/api/mcp/route.ts` pins `export const runtime = 'nodejs'` explicitly because it uses the MCP SDK and stream transports.
- npm — `package-lock.json` is committed at the repo root; `mcp-server/package-lock.json` lives alongside the MCP workspace. No `pnpm-lock.yaml` / `yarn.lock`.
- Lockfile: present (both packages).
## Frameworks
- Next.js ^16.2.1 — App Router (`src/app/`). Configured in `next.config.js`: `reactStrictMode: false`, `turbopack.root` pinned, `serverExternalPackages` lists `@react-pdf/renderer`, `mammoth`, `pdf-parse`, `canvas`, `@modelcontextprotocol/sdk` (Node-only deps must not be bundled). `experimental.optimizePackageImports` covers `lucide-react`, `recharts`, `motion`, `@react-three/*`, `three`, `ogl`, `@number-flow/react`. Security headers (`X-Frame-Options`, `Strict-Transport-Security`, etc.) applied to `/:path*`. Redirects: `/mentor → /terminal`, `/v2 → /`. `productionBrowserSourceMaps: false`.
- React ^19.2.4 + react-dom ^19.2.4.
- NextAuth `5.0.0-beta.30` — `src/auth.ts` configures Credentials + GitHub providers; JWT session strategy via `src/auth.config.ts`.
- Tailwind CSS — Utility-first styling. No root `tailwind.config.*` is committed (Tailwind v4 zero-config or inline `@theme` in `src/app/globals.css`); colors and tokens are defined directly in CSS.
- Vitest ^4.1.0 — `vitest.config.ts` enables globals, excludes `node_modules`, `.next`, and `.claude/worktrees`. `@` alias mirrors the app's `@/*`. Tests live in `src/__tests__/`.
- Next CLI (`next dev`, `next build`, `next start`) — declared in `package.json` scripts. `npm run dev:clean` wipes `.next` and `tsconfig.tsbuildinfo` before booting.
- ESLint ^8 with `eslint-config-next` ^14 — `.eslintrc.json` extends `next/core-web-vitals`, ignores `node_modules`, `.next`, `out`, `mcp-server/dist`, `scripts`, `supabase`.
- TypeScript ^5.5 compiler — `noEmit: true`; type-check is implicit via `next build` and editor tooling.
- `npm run validate` chains lint + test + build.
## Key Dependencies
- `@google/generative-ai` 0.24.1 — Gemini 2.5 Flash / Flash-Lite client. Primary LLM in `src/lib/llm/providers.ts`.
- `@anthropic-ai/sdk` ^0.90.0 — Claude Haiku 4.5 fallback adapter in `src/lib/llm/providers.ts`.
- `@supabase/supabase-js` ^2.101.0 — Service-role PostgreSQL client. Lazy-initialized in `src/lib/supabase.ts` (proxy + `getSupabase()`).
- `next-auth` `5.0.0-beta.30` — Auth, JWT sessions, GitHub OAuth provider.
- `bcryptjs` ^3.0.3 (+ `@types/bcryptjs`) — Credential password hashing in `src/lib/userStorage.ts` and `src/auth.ts`.
- `zod` ^4.3.6 — Runtime schema validation for all LLM outputs and API payloads (`src/lib/schemas.ts`).
- `resend` ^6.10.0 — Transactional email (OTP, invitations) via `src/lib/email.ts`.
- `@google-analytics/data` ^5.2.1 — GA4 Data API client in `src/lib/analyticsEngine.ts`. Transitively pulls `google-auth-library` ^10.6.1 for OAuth2.
- `@modelcontextprotocol/sdk` ^1.29.0 — Powers both the in-app HTTP MCP endpoint (`src/app/api/mcp/route.ts`) and the standalone stdio server (`mcp-server/src/index.ts`).
- `@vercel/analytics` ^2.0.1 — Web analytics tag mounted in `src/app/layout.tsx`.
- `jszip` ^3.10.1 — Unpacks GitHub zipball downloads in `src/lib/githubFetcher.ts`.
- `pdf-parse` ^2.4.5, `mammoth` ^1.12.0 — Text extraction from PDF / DOCX uploads (`src/app/api/projects/extract-text/route.ts`). Server-only, listed in `serverExternalPackages`.
- `@react-pdf/renderer` ^4.3.3 — Server-rendered project PDFs (`src/lib/projectPdf.tsx`, `src/app/api/projects/[id]/pdf/route.ts`).
- Radix UI primitives (28 packages: `@radix-ui/react-accordion`, `-alert-dialog`, `-avatar`, `-checkbox`, `-collapsible`, `-context-menu`, `-dialog`, `-dropdown-menu`, `-hover-card`, `-label`, `-menubar`, `-navigation-menu`, `-popover`, `-progress`, `-radio-group`, `-scroll-area`, `-select`, `-separator`, `-slider`, `-slot`, `-switch`, `-tabs`, `-toast`, `-toggle`, `-toggle-group`, `-toolbar`, `-tooltip`) plus `@radix-ui/themes` ^3.3.0.
- `lucide-react` ^1.12.0 — Icon set.
- `motion` ^12.38.0 — Animations.
- `next-themes` ^0.4.6 — Light/dark theming.
- `@react-three/fiber` ^9.6.1, `@react-three/drei` ^10.7.7, `three` ^0.184.0, `ogl` ^1.0.11 — 3D/landing visuals.
- `recharts` ^3.8.0 — Analytics charts.
- `@number-flow/react` ^0.6.0 — Animated number ticker.
- `@fontsource/inter`, `@fontsource/jetbrains-mono` — Self-hosted fonts.
## Configuration
- Loaded by Next.js from `.env.local` (development) / Vercel environment variables (production). Validated in `src/lib/env.ts` via `validateBootEnv()` (called from `src/auth.ts`) and per-request `validateEnv()` for Gemini.
- Required at boot: `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Effectively required in production: `RESEND_API_KEY` (registration OTP).
- Recommended in production: `ANTHROPIC_API_KEY` (Claude fallback), `CRON_SECRET` (Vercel cron bearer), `AUTH_URL` / `NEXT_PUBLIC_BASE_URL` (callback URLs).
- Optional integrations: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (GA4 OAuth), `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (or legacy `GITHUB_ID` / `GITHUB_SECRET`), `FIRECRAWL_API_KEY`, `META_APP_ID` / `META_APP_SECRET` / `META_REDIRECT_URI` (Instagram Graph), `LOG_LEVEL`, `QUOTA_EXEMPT_EMAILS`, `WAITLIST_ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL` (MCP discovery base), `RECGON_MCP_TOKEN` (stdio MCP server only).
- `.env.local` is gitignored; no `.env.example` is committed in the repo root.
- `next.config.js` — Next/Turbopack config, headers, redirects.
- `tsconfig.json` — Strict TS, `@/*` alias, excludes `mcp-server`.
- `vitest.config.ts` — Test runner config.
- `.eslintrc.json` — ESLint config (legacy format).
- `vercel.json` — Per-route `maxDuration` overrides (analyze: 300s, pdf/chat/marketing/analytics: 60s, cron jobs: 300s) and cron schedule definitions.
## Platform Requirements
- Node 20+ (Next 16 / React 19 baseline).
- Local Supabase project or pointer to a remote project via `SUPABASE_URL` + service-role key.
- `.env.local` populated with at least the boot-required variables.
- Vercel — deployment target. `vercel.json` declares cron jobs and function timeouts; the host-redirect rule moves `www.recgon.app → recgon.app`.
- Supabase (PostgreSQL) — managed instance accessed via service-role key.
- Resend — email sending domain `noreply@recgon.app`.
## MCP Server Sub-Workspace
- Runtime: Node 20+ over stdio (`StdioServerTransport`).
- Scripts: `start` and `dev` use `tsx` ^4 for direct TS execution; `build` runs `tsc`.
- Dependencies: `@modelcontextprotocol/sdk` ^1.12.0, `@supabase/supabase-js` ^2.101.1.
- Dev: `tsx` ^4, `typescript` ^5.5.
- Excluded from the main `tsconfig.json` (top-level `exclude: ["mcp-server"]`).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Module System
- **ESM throughout.** `package.json` does not set `"type"`, so Next.js / TypeScript resolve modules via `tsconfig.json` `"module": "esnext"` + `"moduleResolution": "bundler"`. All `.ts`/`.tsx` files use `import` / `export` — no `require()` in `src/`.
- **TypeScript strict mode** is on (`tsconfig.json` → `"strict": true`). Treat any new code as `noImplicitAny` / `strictNullChecks` compatible.
- **Path alias.** `@/*` resolves to `./src/*` (declared in `tsconfig.json` and mirrored in `vitest.config.ts`). Import application code as `@/lib/...`, `@/components/...`, `@/auth`. Use relative imports only inside `src/__tests__/` (tests import `../lib/...`).
- **JSX:** `"jsx": "react-jsx"` — never `import React from 'react'` just for JSX, only when you actually use `React.*`.
- **mcp-server is excluded** from `tsconfig.json` and ESLint — it has its own toolchain.
## Naming Patterns
- React components: PascalCase `.tsx` — `AppShell.tsx`, `TeamProvider.tsx`, `TeamSwitcher.tsx`, `RecgonLogo.tsx`, `Toast.tsx`, `Select.tsx`, `ErrorBoundary.tsx`, `ThemeProvider.tsx`.
- Library modules / utilities: camelCase `.ts` — `teamStorage.ts`, `chatStorage.ts`, `analyticsStorage.ts`, `userStorage.ts`, `analysisQuota.ts`, `apiError.ts`, `logger.ts`, `commitSummary.ts`, `appContext.ts`.
- Route segment files: lowercase, Next.js conventions — `route.ts`, `page.tsx`, `layout.tsx`, `loading.tsx`. Dynamic segments use bracket folders `[id]`. Multi-word segment files use kebab-case (e.g. `src/app/projects/[id]/tasks/list-view.tsx`).
- Tests: `*.test.ts` co-located in `src/__tests__/` (never beside the source file). Example: `src/__tests__/schemas.test.ts`.
- `camelCase` for everything exported from `src/lib/` — `getAllProjects`, `verifyTeamAccess`, `chatViaChain`, `parseAIResponse`, `enqueueJob`.
- Async functions return `Promise<T>` explicitly when the public type matters (see `verifyTeamAccess(teamId: string, userId: string): Promise<string | null>` in `src/lib/teamStorage.ts`).
- Test-only escape hatches: namespace under `__testing` (see `src/lib/recgon/brain.ts` → `__testing.nextStepsFromProject`).
- `camelCase` for locals, `UPPER_SNAKE_CASE` for module-level constants (`REQUEST_TIMEOUT_MS`, `GEMINI_MODEL_CHAIN`, `MAX_ANALYSES`, `COOLDOWN_MS`).
- `PascalCase`. Prefer `interface` for object shapes that are exported as data contracts (`Team`, `TeamMember`, `TeamInvitation`) and `type` for unions/aliases (`Level`, `ChatOptions`, `LLMProvider`).
- Zod-derived types live next to the schema; usually inferred with `z.infer<typeof Schema>` instead of redeclared by hand.
## Code Style
- No `.prettierrc` / `prettier.config.*` file is present. Code style is enforced solely by ESLint + `next/core-web-vitals` and editor defaults. Style conventions visible across the codebase:
- `.eslintrc.json` — extends `next/core-web-vitals` only. No custom rules.
- `ignorePatterns`: `node_modules/`, `.next/`, `out/`, `mcp-server/dist/`, `scripts/`, `supabase/`.
- Run via `npm run lint` (`eslint .`).
## Import Organization
## Project Rules (Non-Negotiable)
- **All prompts in `src/lib/prompts.ts`.** Never inline a system or user prompt in a route handler, worker, or component. Callers import a named prompt builder (e.g. `buildAnalysisPrompt`) and pass arguments. `src/lib/prompts.ts` is the single source of truth for what the model sees.
- **All schemas in `src/lib/schemas.ts`.** Zod schemas (`AnalysisResultSchema`, `InstagramContentSchema`, `TikTokContentSchema`, `GoogleAdsContentSchema`, `CampaignPlanResponseSchema`, `AnalyticsInsightsSchema`, etc.) and the JSON-coercion helper `parseAIResponse` live here. Never inline a `z.object({ ... })` next to a route handler — define it in `schemas.ts` and import it.
- **UI primitives via Radix.** Use `@radix-ui/react-*` (dialog, dropdown-menu, tooltip, popover, tabs, select, etc.) and `@radix-ui/themes` (`Box`, `Flex`, `Text`, `Button`, `Card`) instead of hand-rolling accessible interactive components. The `package.json` already pulls in every Radix primitive you'd need.
- **Server-only Supabase.** `src/lib/supabase.ts` reads `SUPABASE_SERVICE_ROLE_KEY` at request time. **Never import it from a `'use client'` file or expose it via a client bundle.** All DB access goes through server modules (`src/lib/storage.ts`, `src/lib/teamStorage.ts`, `src/lib/userStorage.ts`, `src/lib/chatStorage.ts`, `src/lib/analyticsStorage.ts`, `src/lib/analysisQuota.ts`, `src/lib/integrationStorage.ts`, etc.), which are then called from `route.ts` handlers, server actions, or workers.
- **Team-scoped data model.** Every storage call that touches a tenant resource must take `teamId` (and usually `userId`). Verify access **before** any read/write:
## Error Handling
- `src/lib/apiError.ts` exports:
- **Validation:** zod schemas from `src/lib/schemas.ts`. For AI output specifically, `parseAIResponse(raw, schema)` strips ``` ```json ``` fences, extracts JSON from prose, and throws on schema mismatch.
- **Status codes used:** 200/201 success · 400 client error (missing field, bad input) · 401 unauthenticated · 403 wrong team / no access · 429 rate limited · 503 model overloaded · 500 catch-all.
- `cloneGitHubRepo` throws messages starting with `Repository`, `GitHub`, `Invalid GitHub`, `Could not parse`, or `Failed to download` — the route checks for these prefixes and forwards them as 400 instead of 500.
- LLM provider errors include `503`, `529`, `429`, or `overloaded` / `quota` strings so `isOverloaded` / `isRateLimited` (`src/lib/llm/utils.ts`) classify them correctly.
## Logging
- Threshold via `LOG_LEVEL` env (`debug` | `info` | `warn` | `error`; default `info` in prod, `debug` in dev).
- **Never log raw model outputs, request bodies, tokens, or PII.** Pass small tagged metadata objects: `logger.info('claimed job', { jobId, kind, attempt })`.
- `Error` instances get short-formatted as `${name}: ${message}` automatically.
## LLM Call Patterns
| Entry point | When to use |
|---|---|
| `chat(systemPrompt, userPrompt, options?)` | Backwards-compatible single-provider Gemini call (`src/lib/gemini.ts` re-exports it for legacy callers). |
| `chatViaProviders([providers], sys, user, opts?)` | Explicit provider list, no built-in chain. |
| `chatViaChain(providers, sys, user, opts?, breaker?)` | **Default for new code.** Walks Gemini → Claude, integrates the circuit breaker, classifies recoverable vs fatal errors, records success/failure per provider. |
| `chatHedged(...)` | Adaptive hedging for interactive non-streaming calls (only when latency matters and idempotency is safe). |
- `withRetry(fn, retries?, label?)` — exponential backoff for overload (3000·2^n ms) and rate-limit (5000·(n+1) ms) errors, jittered, capped at 20 s. Re-throws non-recoverable errors immediately.
- `withTimeout(promise, ms)` — wraps a promise with a hard timeout. `REQUEST_TIMEOUT_MS = 90_000` is the default for LLM requests.
- `isOverloaded`, `isRateLimited`, `isRecoverable` — message-based error classifiers used by retry / breaker / fallback logic.
- Set `responseMimeType: 'application/json'` (default in `ChatOptions`) for any call you intend to parse downstream; `'text/plain'` only for short prose outputs (e.g. commit summaries) where JSON mode causes string fragmentation.
- Always pass the result through `parseAIResponse(raw, schema)` or `generateStructuredOutput({ taskKind, schema, ... })` from `src/lib/llm/quality.ts` — never trust raw model text.
## Comments
- File-level doc comments on shared modules explain intent and constraints (see `src/lib/logger.ts`, `src/lib/apiError.ts`, `src/lib/supabase.ts`).
- Inline `//` comments are reserved for non-obvious decisions (regulatory limits, retry math, edge cases, "why this branch exists"). Don't restate what the code already says.
- No JSDoc / TSDoc convention — types in TypeScript carry the API contract.
- `// eslint-disable-next-line` is used sparingly and only when there's a clear reason (e.g. `no-console` inside the logger itself).
## Function Design
- Keep functions focused: storage helpers each handle one table operation, route handlers do auth → validate → call lib → respond.
- Pass `teamId` and `userId` explicitly as positional arguments rather than wrapping in an options object — see signatures across `src/lib/storage.ts`, `src/lib/teamStorage.ts`.
- Return `null` for "not found" (`verifyTeamAccess` returns `string | null`); throw only for invariant violations or unexpected DB errors.
## Module Design
- **Exports:** named exports throughout. Default exports only where Next.js requires them (`page.tsx`, `layout.tsx`, `route.ts` handlers do not use default; React component pages do).
- **Barrel files:** not used. Import directly from the module that owns the export (`import { verifyTeamAccess } from '@/lib/teamStorage'`).
- **Module boundaries:**
- **Client/server split:** any file that touches Supabase, the LLM SDKs, Resend, or `next-auth` must be a server module. Client components are explicitly marked with `'use client';` at the top of the file (`AppShell.tsx`, `Toast.tsx`, `src/app/page.tsx`).
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- **Multi-provider LLM chain with shared circuit breaker.** `chatViaChain()` / `chatViaProviders()` (`src/lib/llm/providers.ts`) try Gemini first, fall back to Claude Haiku. The breaker lives in Postgres (`llm_health` table) so every Vercel instance agrees on provider health; fail-open is mandatory so a broken breaker can't degrade working providers.
- **Persistent job queue for long-running AI work.** Heavy analyses (`codebase_analysis`, `competitor_analysis`, `idea_analysis`, `task_verification`, `commit_summary`) are enqueued into `llm_jobs` and drained by `/api/cron/llm-jobs` every minute with exponential backoff (~7.5h retry horizon). Interactive paths use `chatViaChain()` synchronously.
- **Team-scoped data model.** Every domain table carries `team_id`; every route/lib call checks that the authenticated user belongs to the team. Projects, tasks, calendar, chat conversations all key off `teamId`.
- **AI Product Manager dispatcher.** `runDispatch(teamId)` (`src/lib/recgon/dispatcher.ts`) reads the unified brain, mints tasks (idempotent via `dedupKey` + unique partial index), retags stale skills, scores all teammates, and assigns or leaves unassigned with `no_fit` logging. Scheduled recurring entries are minted daily by `/api/cron/recgon-schedule`.
- **All prompts in one file, all Zod schemas in one file.** `src/lib/prompts.ts` and `src/lib/schemas.ts` are the single source of truth — never inline.
- **Same-origin CSRF defense.** `src/proxy.ts` reads `sec-fetch-site` (falling back to `Origin`) and rejects cross-origin mutations before any route runs.
## Layers
- Purpose: route protection, CSRF defense, mobile gate
- Location: `src/proxy.ts`
- Contains: NextAuth `auth(...)` wrapper with explicit allow/deny rules
- Depends on: `src/auth.config.ts` (JWT-only, no DB during edge auth)
- Used by: every non-static request (matcher in the file excludes assets and `/api/auth/**`)
- Purpose: server + client React for the authenticated app and public landing
- Location: `src/app/**/page.tsx` and `layout.tsx`
- Contains: thin RSC pages that fetch overview/projects/teams, plus `'use client'` shells
- Depends on: `src/components/**`, `src/lib/**` (server side)
- Used by: end users via the browser
- Purpose: HTTP/JSON entry points and SSE streams
- Location: `src/app/api/**/route.ts`
- Contains: request parsing, `auth()` + team-access checks, calls into `src/lib/**`
- Depends on: business-logic modules in `src/lib/**`
- Used by: client components via `fetch`, plus Vercel cron and the in-product MCP OAuth flow
- Purpose: domain operations (storage, LLM, scheduling, content generation)
- Location: `src/lib/**`
- Contains: typed CRUD helpers, LLM orchestration, schemas, prompts, Recgon dispatcher
- Depends on: Supabase, Gemini/Anthropic SDKs, GA4, Firecrawl, GitHub REST, Resend
- Used by: route handlers, workers, MCP server
- Purpose: persistent state
- Location: Supabase Postgres (cloud), schema in `supabase/migrations/*.sql` and `supabase-schema.sql`
- Contains: tables for users, teams, projects, agent_tasks, llm_jobs, llm_health, analytics_configs, chat_messages, etc.
- Depends on: nothing in-process
- Used by: every storage module via the service-role client
## Data Flow
### Interactive chat with tool calls
### Long-running idea / codebase analysis
### Recgon AI-PM dispatch loop
- Server: Supabase is the only persistent store; no Redis/queue infra.
- Client: React state + `TeamProvider` context for current team and cached projects; NextAuth `SessionProvider` for the user; no Zustand/Redux.
## Key Abstractions
- Purpose: uniform `chat(systemPrompt, userPrompt, options)` API over Gemini and Anthropic SDKs
- Examples: `geminiProvider`, `claudeProvider` in `src/lib/llm/providers.ts`
- Pattern: adapter + chain-of-responsibility (`chatViaChain`, `chatViaProviders`, optional `chatHedged`)
- Purpose: durable execution of LLM tasks across cold starts
- Examples: `LLMJob` row in `llm_jobs`; workers in `src/lib/llm/workers.ts`
- Pattern: persistent work queue with `FOR UPDATE SKIP LOCKED`, exponential backoff, max-attempt dead-lettering
- Purpose: AI-PM domain types
- Examples: `src/lib/recgon/types.ts`
- Pattern: snapshot pattern — `readUnifiedBrain` returns a versioned `BrainSnapshot` that `mintTasksFromBrain` turns into rows
- Purpose: typed Gemini function-calling tools
- Examples: `src/lib/tools/types.ts`, registry in `src/lib/tools/registry.ts`
- Pattern: each tool exports `{ name, description, parameters: ZodSchema, execute(ctx, args) }`; registry converts Zod → OpenAPI for Gemini
- Purpose: domain-typed CRUD over Supabase
- Examples: `src/lib/storage.ts`, `src/lib/teamStorage.ts`, `src/lib/recgon/storage.ts`, `src/lib/chatStorage.ts`, `src/lib/analyticsStorage.ts`, `src/lib/integrationStorage.ts`
- Pattern: per-domain module exporting plain async functions, scoped by `teamId`
## Entry Points
- Location: `src/proxy.ts`
- Triggers: every non-static HTTP request (matcher defined at bottom of file)
- Responsibilities: JWT check, CSRF same-origin check, mobile-to-landing redirect, MCP/NextAuth bypass
- Location: `src/auth.ts` + `src/app/api/auth/[...nextauth]/route.ts`
- Triggers: `/api/auth/**`
- Responsibilities: credentials + GitHub providers, JWT issuing, waitlist gating in `signIn` callback
- Location: `src/app/layout.tsx`
- Triggers: every server-rendered page
- Responsibilities: HTML scaffold, providers (Theme, Session, Toast), Vercel `<Analytics>`, mesh background, mounts `<AppShell>`
- Location: `src/app/api/cron/llm-jobs/route.ts` (every minute), `src/app/api/cron/recgon-schedule/route.ts` (daily 06:00 UTC)
- Triggers: Vercel cron configured in `vercel.json`
- Responsibilities: drain `llm_jobs`; mint recurring brain entries and dispatch
- Location: `mcp-server/src/index.ts`
- Triggers: Claude Code spawning the binary over stdio
- Responsibilities: registers 4 tools (`list_projects`, `get_project_analysis`, `get_actionable_items`, `mark_item_complete`) and validates the token from `RECGON_MCP_TOKEN`
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
### Inlining Zod schemas at call sites
### Calling Gemini/Anthropic SDKs directly from a route
### Doing heavy LLM work synchronously inside a route
### Reading another team's data because the URL had an id
### Bundling native modules into the edge runtime
## Error Handling
- API routes return `{ error: string }` JSON with appropriate status codes (`401`, `403`, `404`, `429`, `500`).
- LLM calls wrap every attempt with `withRetry` + `withTimeout` and feed outcomes back to the circuit breaker.
- Breaker is fail-open: any error inside `shouldTry` returns `true` so a degraded breaker doesn't black-hole working providers.
- Validation errors surface from `parseAIResponse` (Zod) and bubble up as worker failures, which retry up to `max_attempts` then mark `dead`.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| design-md | Analyze Stitch projects and synthesize a semantic design system into DESIGN.md files | `.claude/skills/design-md/SKILL.md` |
| design-taste-frontend | Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering. | `.claude/skills/design-taste-frontend/SKILL.md` |
| extract-design-system | Extract design primitives from a public website and generate starter token files for your project. | `.claude/skills/extract-design-system/SKILL.md` |
| find-skills | Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill. | `.claude/skills/find-skills/SKILL.md` |
| form-cro | When the user wants to optimize any form that is NOT signup/registration — including lead capture forms, contact forms, demo request forms, application forms, survey forms, or checkout forms. Also use when the user mentions "form optimization," "lead form conversions," "form friction," "form fields," "form completion rate," "contact form," "nobody fills out our form," "form abandonment," "too many fields," "demo request form," or "lead form isn't converting." Use this for any non-signup form that captures information. For signup/registration forms, see signup-flow-cro. For popups containing forms, see popup-cro. | `.claude/skills/form-cro/SKILL.md` |
| high-end-visual-design | Teaches the AI to design like a high-end agency. Defines the exact fonts, spacing, shadows, card structures, and animations that make a website feel expensive. Blocks all the common defaults that make AI designs look cheap or generic. | `.claude/skills/high-end-visual-design/SKILL.md` |
| impeccable | Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks. | `.claude/skills/impeccable/SKILL.md` |
| marketing-psychology | "When the user wants to apply psychological principles, mental models, or behavioral science to marketing. Also use when the user mentions 'psychology,' 'mental models,' 'cognitive bias,' 'persuasion,' 'behavioral science,' 'why people buy,' 'decision-making,' 'consumer behavior,' 'anchoring,' 'social proof,' 'scarcity,' 'loss aversion,' 'framing,' or 'nudge.' Use this whenever someone wants to understand or leverage how people think and make decisions in a marketing context." | `.claude/skills/marketing-psychology/SKILL.md` |
| next-cache-components | Next.js 16 Cache Components - PPR, use cache directive, cacheLife, cacheTag, updateTag | `.claude/skills/next-cache-components/SKILL.md` |
| page-cro | When the user wants to optimize, improve, or increase conversions on any marketing page — including homepage, landing pages, pricing pages, feature pages, or blog posts. Also use when the user says "CRO," "conversion rate optimization," "this page isn't converting," "improve conversions," "why isn't this page working," "my landing page sucks," "nobody's converting," "low conversion rate," "bounce rate is too high," "people leave without signing up," or "this page needs work." Use this even if the user just shares a URL and asks for feedback — they probably want conversion help. For signup/registration flows, see signup-flow-cro. For post-signup activation, see onboarding-cro. For forms outside of signup, see form-cro. For popups/modals, see popup-cro. | `.claude/skills/page-cro/SKILL.md` |
| react:components | Converts Stitch designs into modular Vite and React components using system-level networking and AST-based validation. | `.claude/skills/react-components/SKILL.md` |
| shadcn | Manages shadcn components and projects — adding, searching, fixing, debugging, styling, and composing UI. Provides project context, component docs, and usage examples. Applies when working with shadcn/ui, component registries, presets, --preset codes, or any project with a components.json file. Also triggers for "shadcn init", "create an app with --preset", or "switch to --preset". | `.claude/skills/shadcn/SKILL.md` |
| stitch-design-taste | Semantic Design System Skill for Google Stitch. Generates agent-friendly DESIGN.md files that enforce premium, anti-generic UI standards — strict typography, calibrated color, asymmetric layouts, perpetual micro-motion, and hardware-accelerated performance. | `.claude/skills/stitch-design-taste/SKILL.md` |
| vercel-react-best-practices | React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on tasks involving React components, Next.js pages, data fetching, bundle optimization, or performance improvements. | `.claude/skills/vercel-react-best-practices/SKILL.md` |
| frontend-design | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics. | `.agents/skills/frontend-design/SKILL.md` |
| site-architecture | When the user wants to plan, map, or restructure their website's page hierarchy, navigation, URL structure, or internal linking. Also use when the user mentions "sitemap," "site map," "visual sitemap," "site structure," "page hierarchy," "information architecture," "IA," "navigation design," "URL structure," "breadcrumbs," "internal linking strategy," "website planning," "what pages do I need," "how should I organize my site," or "site navigation." Use this whenever someone is planning what pages a website should have and how they connect. NOT for XML sitemaps (that's technical SEO — see seo-audit). For SEO audits, see seo-audit. For structured data, see schema-markup. | `.agents/skills/site-architecture/SKILL.md` |
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
