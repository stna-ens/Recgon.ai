# Technology Stack

**Analysis Date:** 2026-05-10

## Languages

**Primary:**
- TypeScript ^5.5.0 — All application source under `src/` and `mcp-server/src/`. `tsconfig.json` is `strict: true`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler`, JSX = `react-jsx`. Path alias `@/* → ./src/*`.

**Secondary:**
- JavaScript (CommonJS) — Build/config glue only: `next.config.js`, `scripts/llm-eval.mjs` (ESM script).
- SQL — Supabase migrations under `supabase/migrations/` and `supabase-migrations/`, plus baseline `supabase-schema.sql`.
- CSS — Tailwind utility classes plus hand-authored layers in `src/app/globals.css` and per-route stylesheets (e.g. `src/app/projects/[id]/overview.css`).

## Runtime

**Environment:**
- Node.js — Next.js 16 / React 19 require Node 20+. No `.nvmrc` or `engines` field is present; the Vercel deployment target sets the runtime.
- API routes default to the Node.js runtime; `src/app/api/mcp/route.ts` pins `export const runtime = 'nodejs'` explicitly because it uses the MCP SDK and stream transports.

**Package Manager:**
- npm — `package-lock.json` is committed at the repo root; `mcp-server/package-lock.json` lives alongside the MCP workspace. No `pnpm-lock.yaml` / `yarn.lock`.
- Lockfile: present (both packages).

## Frameworks

**Core:**
- Next.js ^16.2.1 — App Router (`src/app/`). Configured in `next.config.js`: `reactStrictMode: false`, `turbopack.root` pinned, `serverExternalPackages` lists `@react-pdf/renderer`, `mammoth`, `pdf-parse`, `canvas`, `@modelcontextprotocol/sdk` (Node-only deps must not be bundled). `experimental.optimizePackageImports` covers `lucide-react`, `recharts`, `motion`, `@react-three/*`, `three`, `ogl`, `@number-flow/react`. Security headers (`X-Frame-Options`, `Strict-Transport-Security`, etc.) applied to `/:path*`. Redirects: `/mentor → /terminal`, `/v2 → /`. `productionBrowserSourceMaps: false`.
- React ^19.2.4 + react-dom ^19.2.4.
- NextAuth `5.0.0-beta.30` — `src/auth.ts` configures Credentials + GitHub providers; JWT session strategy via `src/auth.config.ts`.
- Tailwind CSS — Utility-first styling. No root `tailwind.config.*` is committed (Tailwind v4 zero-config or inline `@theme` in `src/app/globals.css`); colors and tokens are defined directly in CSS.

**Testing:**
- Vitest ^4.1.0 — `vitest.config.ts` enables globals, excludes `node_modules`, `.next`, and `.claude/worktrees`. `@` alias mirrors the app's `@/*`. Tests live in `src/__tests__/`.

**Build/Dev:**
- Next CLI (`next dev`, `next build`, `next start`) — declared in `package.json` scripts. `npm run dev:clean` wipes `.next` and `tsconfig.tsbuildinfo` before booting.
- ESLint ^8 with `eslint-config-next` ^14 — `.eslintrc.json` extends `next/core-web-vitals`, ignores `node_modules`, `.next`, `out`, `mcp-server/dist`, `scripts`, `supabase`.
- TypeScript ^5.5 compiler — `noEmit: true`; type-check is implicit via `next build` and editor tooling.
- `npm run validate` chains lint + test + build.

## Key Dependencies

**Critical:**
- `@google/generative-ai` 0.24.1 — Gemini 2.5 Flash / Flash-Lite client. Primary LLM in `src/lib/llm/providers.ts`.
- `@anthropic-ai/sdk` ^0.90.0 — Claude Haiku 4.5 fallback adapter in `src/lib/llm/providers.ts`.
- `@supabase/supabase-js` ^2.101.0 — Service-role PostgreSQL client. Lazy-initialized in `src/lib/supabase.ts` (proxy + `getSupabase()`).
- `next-auth` `5.0.0-beta.30` — Auth, JWT sessions, GitHub OAuth provider.
- `bcryptjs` ^3.0.3 (+ `@types/bcryptjs`) — Credential password hashing in `src/lib/userStorage.ts` and `src/auth.ts`.
- `zod` ^4.3.6 — Runtime schema validation for all LLM outputs and API payloads (`src/lib/schemas.ts`).
- `resend` ^6.10.0 — Transactional email (OTP, invitations) via `src/lib/email.ts`.
- `@google-analytics/data` ^5.2.1 — GA4 Data API client in `src/lib/analyticsEngine.ts`. Transitively pulls `google-auth-library` ^10.6.1 for OAuth2.
- `@modelcontextprotocol/sdk` ^1.29.0 — Powers both the in-app HTTP MCP endpoint (`src/app/api/mcp/route.ts`) and the standalone stdio server (`mcp-server/src/index.ts`).

**Infrastructure:**
- `@vercel/analytics` ^2.0.1 — Web analytics tag mounted in `src/app/layout.tsx`.
- `jszip` ^3.10.1 — Unpacks GitHub zipball downloads in `src/lib/githubFetcher.ts`.
- `pdf-parse` ^2.4.5, `mammoth` ^1.12.0 — Text extraction from PDF / DOCX uploads (`src/app/api/projects/extract-text/route.ts`). Server-only, listed in `serverExternalPackages`.
- `@react-pdf/renderer` ^4.3.3 — Server-rendered project PDFs (`src/lib/projectPdf.tsx`, `src/app/api/projects/[id]/pdf/route.ts`).

**UI:**
- Radix UI primitives (28 packages: `@radix-ui/react-accordion`, `-alert-dialog`, `-avatar`, `-checkbox`, `-collapsible`, `-context-menu`, `-dialog`, `-dropdown-menu`, `-hover-card`, `-label`, `-menubar`, `-navigation-menu`, `-popover`, `-progress`, `-radio-group`, `-scroll-area`, `-select`, `-separator`, `-slider`, `-slot`, `-switch`, `-tabs`, `-toast`, `-toggle`, `-toggle-group`, `-toolbar`, `-tooltip`) plus `@radix-ui/themes` ^3.3.0.
- `lucide-react` ^1.12.0 — Icon set.
- `motion` ^12.38.0 — Animations.
- `next-themes` ^0.4.6 — Light/dark theming.
- `@react-three/fiber` ^9.6.1, `@react-three/drei` ^10.7.7, `three` ^0.184.0, `ogl` ^1.0.11 — 3D/landing visuals.
- `recharts` ^3.8.0 — Analytics charts.
- `@number-flow/react` ^0.6.0 — Animated number ticker.
- `@fontsource/inter`, `@fontsource/jetbrains-mono` — Self-hosted fonts.

## Configuration

**Environment:**
- Loaded by Next.js from `.env.local` (development) / Vercel environment variables (production). Validated in `src/lib/env.ts` via `validateBootEnv()` (called from `src/auth.ts`) and per-request `validateEnv()` for Gemini.
- Required at boot: `GEMINI_API_KEY`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Effectively required in production: `RESEND_API_KEY` (registration OTP).
- Recommended in production: `ANTHROPIC_API_KEY` (Claude fallback), `CRON_SECRET` (Vercel cron bearer), `AUTH_URL` / `NEXT_PUBLIC_BASE_URL` (callback URLs).
- Optional integrations: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (GA4 OAuth), `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (or legacy `GITHUB_ID` / `GITHUB_SECRET`), `FIRECRAWL_API_KEY`, `META_APP_ID` / `META_APP_SECRET` / `META_REDIRECT_URI` (Instagram Graph), `LOG_LEVEL`, `QUOTA_EXEMPT_EMAILS`, `WAITLIST_ADMIN_EMAILS`, `NEXT_PUBLIC_APP_URL` (MCP discovery base), `RECGON_MCP_TOKEN` (stdio MCP server only).
- `.env.local` is gitignored; no `.env.example` is committed in the repo root.

**Build:**
- `next.config.js` — Next/Turbopack config, headers, redirects.
- `tsconfig.json` — Strict TS, `@/*` alias, excludes `mcp-server`.
- `vitest.config.ts` — Test runner config.
- `.eslintrc.json` — ESLint config (legacy format).
- `vercel.json` — Per-route `maxDuration` overrides (analyze: 300s, pdf/chat/marketing/analytics: 60s, cron jobs: 300s) and cron schedule definitions.

## Platform Requirements

**Development:**
- Node 20+ (Next 16 / React 19 baseline).
- Local Supabase project or pointer to a remote project via `SUPABASE_URL` + service-role key.
- `.env.local` populated with at least the boot-required variables.

**Production:**
- Vercel — deployment target. `vercel.json` declares cron jobs and function timeouts; the host-redirect rule moves `www.recgon.app → recgon.app`.
- Supabase (PostgreSQL) — managed instance accessed via service-role key.
- Resend — email sending domain `noreply@recgon.app`.

## MCP Server Sub-Workspace

`mcp-server/` is an independent npm workspace (`mcp-server/package.json`):

- Runtime: Node 20+ over stdio (`StdioServerTransport`).
- Scripts: `start` and `dev` use `tsx` ^4 for direct TS execution; `build` runs `tsc`.
- Dependencies: `@modelcontextprotocol/sdk` ^1.12.0, `@supabase/supabase-js` ^2.101.1.
- Dev: `tsx` ^4, `typescript` ^5.5.
- Excluded from the main `tsconfig.json` (top-level `exclude: ["mcp-server"]`).

---

*Stack analysis: 2026-05-10*
