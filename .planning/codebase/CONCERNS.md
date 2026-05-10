# Codebase Concerns

**Analysis Date:** 2026-05-10

## Tech Debt

**Orphaned feedback identifiers after feature removal (2026-05-11):**
- Issue: The feedback subsystem was deleted (routes, panels, schemas, tests), but stale identifiers still leak into shared modules. `feedbackSupported`, `isFeedbackSupportedSource()`, `getFeedbackPlatformAvailability()`, and `isSelectableFeedbackPlatform()` are still exported.
- Files: `src/lib/sourceProfiles.ts` (lines 13, 119, 132, 145, 158, 170, 204–222), `src/lib/rateLimit.ts:63` (`FEEDBACK_LIMIT` constant), `src/__tests__/sourceProfiles.test.ts:8,42–44`
- Impact: Future readers will assume a feedback feature still exists. Tests still reference the removed concept (`expect(...).toBe(false)` for "Instagram feedback"). Dead `FEEDBACK_LIMIT` rate-limit constant is exported but no caller remains.
- Fix approach: Rename `feedbackSupported` → `discoverySupported` (or similar), drop `FEEDBACK_LIMIT`, rewrite the orphaned tests in `sourceProfiles.test.ts`, and audit the `user_feedback` table referenced in `src/app/api/help-feedback/route.ts` (this is the *new* help-feedback feature — keep distinct from the removed product-feedback system).

**Orphaned CSS for deleted feedback pages:**
- Issue: ~150 lines of CSS for `.feedback-page`, `.feedback-hero-card`, `.feedback-control-*`, `.feedback-panel-card`, `feedbackEnter` / `feedbackDrawerSettle` keyframes remain in global styles even though no DOM ever renders them.
- Files: `src/app/globals.css` lines 1178–1357+
- Impact: Bundle bloat in the global stylesheet (loaded on every page). Confusing for design changes.
- Fix approach: Delete every `.feedback-*` selector and the two `@keyframes feedbackEnter`/`feedbackDrawerSettle` blocks.

**Comment refers to removed `/feedback` page:**
- Issue: Inline comment in evidence-source verifier says "we know this from `/feedback`'s YouTube experience" — that route no longer exists.
- Files: `src/lib/recgon/evidenceSources.ts:349`
- Impact: Misleading historical context for new contributors.
- Fix approach: Rewrite comment to drop the route reference (keep the substantive point about platform shell HTML).

**Very large page components (1000+ lines):**
- Issue: Several "page" files act as god-modules combining data fetching, state machine, UI, and modals.
- Files: `src/app/team/page.tsx` (2082 lines), `src/app/tasks/page.tsx` (1808 lines), `src/app/settings/page.tsx` (1754 lines), `src/components/v2/terminal/TerminalShell.tsx` (1750 lines), `src/app/verify/page.tsx` (1729 lines), `src/app/projects/[id]/settings/page.tsx` (1690 lines), `src/components/recgon/RecgonAdminPanel.tsx` (1430 lines)
- Impact: Hard to review, slow to typecheck/recompile, high risk of merge conflicts, difficult to test in isolation.
- Fix approach: Extract per-tab subcomponents into co-located files (e.g. `tasks/_components/TaskBoard.tsx`), pull state machines into hooks under `src/lib/hooks/`, and move dialog content into modal components.

**Inline `Proxy` over Supabase client:**
- Issue: `src/lib/supabase.ts` exposes a `Proxy` wrapper to make `supabase.from(...)` work without explicit init. Comments acknowledge this is for backwards compatibility with `this`-binding inside the chained query builders.
- Files: `src/lib/supabase.ts:17–26`
- Impact: Type inference is degraded (everything is typed as `SupabaseClient` regardless of true shape), and the Proxy can mask runtime errors when env vars are missing until the *next* DB call.
- Fix approach: Migrate all `import { supabase }` callers to `import { getSupabase }` and remove the Proxy. The proxy is documented as "backwards-compatible" — there is no longer any external reason to keep it.

## Known Bugs

**Vercel cron schedule does NOT match `CLAUDE.md` claim of "every minute":**
- Symptoms: `CLAUDE.md` and `src/lib/llm/jobQueue.ts` comments state the queue is drained every minute, but the deployed cron runs once per day (`"schedule": "0 0 * * *"`). Similarly `recgon-schedule` runs once at `0 6 * * *`. With Vercel Hobby plan only supporting daily crons, jobs enqueued at 00:01 wait up to ~24h.
- Files: `vercel.json:36–45` vs `src/app/api/cron/llm-jobs/route.ts:1–8`, `CLAUDE.md` ("Vercel cron (every minute)")
- Trigger: Any user-initiated `idea_analysis`, `codebase_analysis`, or `competitor_analysis` job after the previous tick.
- Workaround: Manually `curl` the cron endpoint (with `CRON_SECRET`) during development. Upgrade to Vercel Pro to allow per-minute crons, or rewire to a different scheduler (Upstash Q-stash, Inngest, GitHub Actions cron).
- Impact: Persistent queue exists but cannot meet the "~7.5h retry horizon" advertised in `CLAUDE.md` — a single missed run can starve the queue for the full day.

**Local-path projects fail inline in `codebase_analysis` worker (known limitation):**
- Symptoms: Submitting a project whose `path` is a local directory (not a GitHub URL) immediately errors in `runCodebaseAnalysis`. The check at the top of the worker requires `githubUrl`.
- Files: `src/lib/llm/workers.ts:72–80`
- Trigger: Any pre-existing project that was created before GitHub-backed analysis became mandatory, or a manually-seeded project row with a filesystem path.
- Workaround: None in product. The user must connect a GitHub repo.
- Fix approach: Either (a) re-introduce a `cloneLocalPath` worker branch, or (b) backfill / refuse local-path projects with a clear migration message instead of throwing the generic "missing required fields" error.

## Security Considerations

**Cron secret check is bypassed in non-production environments:**
- Risk: `authorized()` in `src/app/api/cron/llm-jobs/route.ts:24–30` returns `true` when `CRON_SECRET` is unset *and* `NODE_ENV !== 'production'`. Any preview deployment that forgets to set `CRON_SECRET` is publicly drainable.
- Files: `src/app/api/cron/llm-jobs/route.ts:24–30`
- Current mitigation: Production checks `Bearer ${CRON_SECRET}`. Vercel preview environments inherit prod env if configured.
- Recommendations: Tighten to require `CRON_SECRET` on every environment except literal `NODE_ENV === 'development'` *and* `request.headers.get('host')` matching `localhost`. Treat missing `CRON_SECRET` in any non-dev environment as a hard 503 with a logged warning.

**Supabase service-role key uses bypass RLS — confirmed server-only but Proxy is risky:**
- Risk: `src/lib/supabase.ts` instantiates a service-role client (full DB access, RLS bypassed). The Proxy export means *any* accidental import from a client component would still type-check.
- Files: `src/lib/supabase.ts:1–26`
- Current mitigation: Grep confirms no client components (`src/components/`, `src/app/landing/`, `src/app/login/`, `src/app/register/`) import `@/lib/supabase`. All consumers are server modules or API routes (verified). `NEXT_PUBLIC_*` env vars only carry `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_APP_URL` — no secrets leaked.
- Recommendations: Add an ESLint rule (or `eslint-plugin-only-warn` pattern) that forbids `@/lib/supabase` imports in files containing `'use client'`. Consider renaming the file to `supabase.server.ts` so Next can statically refuse `'use client'` imports.

**MCP server bearer auth is a presence check only, not request-time validation:**
- Risk: `mcp-server/src/auth.ts` only validates that `RECGON_MCP_TOKEN` env var *exists* at boot. There is no `validateAuth(receivedToken)` that compares the inbound token against the expected one on a per-request basis.
- Files: `mcp-server/src/auth.ts:1–11`
- Current mitigation: The MCP server uses stdio transport, so it is only reachable to processes that can spawn the binary (typically Claude Desktop with the token in the user's config). Network exposure is not the default.
- Recommendations: If the MCP server is ever moved to HTTP/SSE transport, add a `validateAuth(actualToken: string): boolean` and call it inside every tool handler. Document this constraint in `mcp-server/README.md`.

**Auth providers conditionally added — silent fallback to credentials-only:**
- Risk: `src/auth.ts:15–26` only registers the GitHub provider when both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` exist. If env is misconfigured, sign-in pages render a "Sign in with GitHub" button (if any) that 404s, or the route silently disables OAuth without a clear error.
- Files: `src/auth.ts:15–26`
- Current mitigation: `src/lib/env.ts` `validateBootEnv()` is called at module load. Need to confirm it covers OAuth pairs.
- Recommendations: Make GitHub OAuth either fully present or explicitly disabled via a feature flag; surface a deployment warning in `validateBootEnv()` for half-configured providers.

**HTML injection surface — JSON-LD only, low risk:**
- Risk: Only one `dangerouslySetInnerHTML` usage in the entire app.
- Files: `src/app/landing/page.tsx:152`
- Current mitigation: The injected value is `JSON.stringify(jsonLd)` of a hard-coded constant — not user input.
- Recommendations: None required. Keep an eye on future `<script>` injections.

**`help-feedback` HTML email path properly escapes:**
- Risk: User-submitted messages are emailed to support; XSS in the support inbox is possible if not escaped.
- Files: `src/app/api/help-feedback/route.ts:13–20`
- Current mitigation: `escapeHtml()` is applied before composing the Resend HTML body.
- Recommendations: None.

## Performance Bottlenecks

**Aurora landing background (~272 lines of WebGL shader on every landing load):**
- Problem: `src/components/landing/Aurora.tsx` ships a full `ogl` WebGL renderer and inline GLSL fragment shader to every landing-page visitor.
- Files: `src/components/landing/Aurora.tsx` (272 lines), `src/components/landing/MobileLanding.tsx` (827 lines)
- Cause: Marketing animation rendered eagerly without `prefers-reduced-motion` gating or below-the-fold lazy mounting.
- Improvement path: Dynamically `import()` `Aurora` with `{ ssr: false }` and gate behind `IntersectionObserver` + `prefers-reduced-motion`. Move the GLSL strings to separate files so they tree-shake when the component is not visible.

**`MobileLanding.tsx` is 827 lines of mostly-static client markup:**
- Problem: Entire mobile landing experience is a single `'use client'` file, shipping all JSX and dependency imports to the browser even when no interactivity is needed below the fold.
- Files: `src/components/landing/MobileLanding.tsx:1`
- Cause: Mixed concerns — animations, marketing copy, and CTA forms all in one client component.
- Improvement path: Split into a server-rendered shell with a small client island for the interactive CTA and scroll-linked sections only.

**Synchronous LLM calls remain in some request paths:**
- Problem: `src/app/api/chat/route.ts`, `src/app/api/overview/brief/route.ts`, `src/app/api/marketing/generate/route.ts`, and `src/app/api/analytics/analyze/route.ts` invoke the LLM chain inside the request lifecycle (configured `maxDuration: 60` in `vercel.json`).
- Files: `vercel.json:13–25`
- Cause: Streaming chat must stay synchronous, but marketing/analytics requests could be queued like `idea_analysis`.
- Improvement path: For non-streaming routes, enqueue an `llm_jobs` row and return a job-id immediately, then poll via `/api/llm/jobs/[id]`. This is partially built (queue, workers, poll endpoint) — extend `marketing_generation` and `analytics_insight` as new `JobKind` values.

**Quota exception lookup hits Supabase on every analysis attempt:**
- Problem: `isExempt()` in `src/lib/analysisQuota.ts:24–50` falls through to a `quota_exceptions` table query when the env-var fast path misses. No caching.
- Files: `src/lib/analysisQuota.ts:24–50`
- Cause: Designed for dashboard-managed exceptions without redeploy. Acceptable, but each `checkAnalysisQuota` does 1 env check + 1 DB query + 1 quota table read.
- Improvement path: 60s in-process LRU on `(email → exempt)` would be sufficient.

## Fragile Areas

**LLM provider chain assumes Anthropic is optional:**
- Files: `src/lib/llm/providers.ts:1–100`
- Why fragile: `CLAUDE.md` warns "Without `ANTHROPIC_API_KEY`, Gemini outages cause user-visible failures." The fallback chain (`chatViaChain` / `chatViaProviders`) only adds Claude if `ANTHROPIC_API_KEY` is set. Production deployments that skip this env var have a single-provider dependency.
- Safe modification: Always set `ANTHROPIC_API_KEY` in prod. Add a boot-time warning in `validateBootEnv()` (`src/lib/env.ts`) when the key is missing in prod.
- Test coverage: `src/__tests__/llmQuality.test.ts` exercises Gemini path. Fallback path is not covered by an end-to-end test.

**Persistent job queue is a single point of failure under daily cron:**
- Files: `src/lib/llm/jobQueue.ts`, `src/app/api/cron/llm-jobs/route.ts`, `vercel.json:38–41`
- Why fragile: With `MAX_BATCH = 3` (`src/app/api/cron/llm-jobs/route.ts:21`) and a daily schedule, any team enqueuing more than 3 jobs at once will see >24h delays. `releaseStuckJobs()` only runs when the cron fires, so a stuck job blocks its slot for a full day.
- Safe modification: Increase `MAX_BATCH` significantly, switch to a sub-hour schedule (requires Vercel Pro), or migrate to an external queue (Inngest / Upstash Q-stash).
- Test coverage: No end-to-end queue tests located in `src/__tests__/`.

**God-module pages (`team/page.tsx`, `tasks/page.tsx`, `settings/page.tsx`):**
- Files: `src/app/team/page.tsx`, `src/app/tasks/page.tsx`, `src/app/settings/page.tsx`, `src/app/projects/[id]/settings/page.tsx`
- Why fragile: Sized 1700–2100 lines. A single typo in any helper function within these files compiles the whole bundle. Multiple branches editing different tabs collide constantly.
- Safe modification: Treat as legacy — when touching a tab, extract it to a sibling component in the same commit.
- Test coverage: Mostly UI; no targeted tests.

**Recgon storage module (`src/lib/recgon/storage.ts`, 863 lines):**
- Files: `src/lib/recgon/storage.ts`
- Why fragile: Centralizes 13+ Supabase table accesses across the Recgon brain. Schema drift in any one table can break unrelated callers.
- Safe modification: Wrap each Supabase call with a typed function and a Zod-parsed return. Today many returns are `as` casts.
- Test coverage: `src/__tests__/recgonBrain.test.ts` (modified in working tree).

## Scaling Limits

**Analysis quota assumes single-user scope:**
- Current capacity: 3 lifetime analyses + 14-day cooldown per user (`MAX_ANALYSES = 3`, `COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000`).
- Limit: This is a *user-level* gate, not a *team-level* gate — a team with one billing owner is constrained by a single user's quota even if multiple members want to re-analyze the project.
- Files: `src/lib/analysisQuota.ts:20–24`
- Scaling path: Migrate quota tracking from `analysis_quotas.user_id` to `(team_id, billing_period)`, or expose a clear upgrade path via `quota_exceptions`.

**`MAX_BATCH = 3` in cron drain caps queue throughput:**
- Current capacity: 3 jobs per cron tick × 1 tick/day = 3 jobs/day max under the deployed schedule.
- Limit: Will hard-block at modest concurrency (e.g. one team uploading 5 GitHub repos in a row).
- Files: `src/app/api/cron/llm-jobs/route.ts:21`
- Scaling path: Bump `MAX_BATCH` to 10–20 *and* fix the cron schedule (see Known Bugs).

**`maxDuration: 300` on `projects/[id]/analyze` and `cron/llm-jobs`:**
- Current capacity: Single LLM analysis can run up to 5 minutes within a serverless function.
- Limit: Large repos (or chained Gemini → Claude fallback) can exceed 5 minutes; Vercel kills the function with no retry on the inline route (the queue does retry).
- Files: `vercel.json:5–10`, `vercel.json:23–25`
- Scaling path: Always route long-running analysis through the queue; the inline `analyze` route should `enqueueJob` and return job-id instead of streaming the full analysis.

## Dependencies at Risk

**Optional `@anthropic-ai/sdk` treated as truly optional:**
- Risk: Missing `ANTHROPIC_API_KEY` strands the app on Gemini only (see Reliability above).
- Impact: Recurring Gemini overload errors during peak hours have no failover.
- Migration plan: Hard-require `ANTHROPIC_API_KEY` in prod via `validateBootEnv()`; document in `CLAUDE.md` as required, not recommended.

**`ogl` (WebGL renderer) only used by Aurora:**
- Risk: Single dependency dragged into the landing bundle for one decorative effect.
- Impact: Bundle size on the most-trafficked page.
- Migration plan: Lazy-load Aurora or replace with a CSS-only gradient animation.

## Missing Critical Features

**No global rate limiting on auth endpoints:**
- Problem: `src/lib/rateLimit.ts` exports rate-limit configs (e.g. `FEEDBACK_LIMIT` — orphan, see Tech Debt) but I did not find a global `auth/send-otp` or `auth/register` rate limiter wired in.
- Blocks: Brute-force password attempts, OTP enumeration, signup-flood spam.
- Files to add: `src/app/api/auth/send-otp/route.ts`, `src/app/api/auth/register/route.ts` should consume `withRateLimit(...)` from `src/lib/rateLimit.ts`.

**Per-request MCP token validation (see Security):**
- Problem: MCP auth only checks env var at boot.
- Blocks: Future HTTP/SSE MCP deployments.

**Boot-time check that `ANTHROPIC_API_KEY` is set in production:**
- Problem: `validateBootEnv()` in `src/lib/env.ts` requires Gemini but not Claude, despite `CLAUDE.md` calling Claude "recommended in production".
- Blocks: A silent deployment with Gemini-only resilience.

## Test Coverage Gaps

**LLM fallback chain (Gemini → Claude):**
- What's not tested: The path where Gemini returns 503/overload and Claude takes over.
- Files: `src/lib/llm/providers.ts`, `src/__tests__/llmQuality.test.ts`
- Risk: The headline "multi-provider chain with circuit breaker" claim is unverified end-to-end.
- Priority: High.

**Persistent job queue (`llm_jobs`) drain semantics:**
- What's not tested: `claimNextJob`, `failJob` retry backoff, `releaseStuckJobs` recovery, `MAX_BATCH` parallelism, cron auth.
- Files: `src/lib/llm/jobQueue.ts`, `src/app/api/cron/llm-jobs/route.ts`
- Risk: Jobs silently stuck in `running` state past `locked_at` are only re-released on the next cron tick — with daily cron this is a full day of user-visible breakage.
- Priority: High.

**Team-access verification on every API route:**
- What's not tested: That every route under `src/app/api/projects/*`, `src/app/api/teams/*`, `src/app/api/llm/jobs/*` calls `verifyTeamAccess()` before reading or mutating.
- Files: All `src/app/api/**/route.ts`
- Risk: A missing guard on one new route leaks cross-team data.
- Priority: High.

**Deleted feedback subsystem regression:**
- What's not tested: That no DB writes hit `feedback_*` tables after removal (only schema migration leftover).
- Files: schema migrations + any code path that referenced the now-deleted `src/app/api/feedback/**` routes.
- Risk: A residual writer continues inserting orphan rows.
- Priority: Medium — investigate via Supabase logs.

**Orphan feedback unit tests:**
- What's not tested correctly: `src/__tests__/sourceProfiles.test.ts:42–44` still asserts on `isFeedbackSupportedSource(...)` even though the consuming feature is gone.
- Files: `src/__tests__/sourceProfiles.test.ts`
- Risk: Tests pass but no longer describe real product behavior.
- Priority: Low (cosmetic, but misleading).

---

*Concerns audit: 2026-05-10*
