# Coding Conventions

**Analysis Date:** 2026-05-10

## Module System

- **ESM throughout.** `package.json` does not set `"type"`, so Next.js / TypeScript resolve modules via `tsconfig.json` `"module": "esnext"` + `"moduleResolution": "bundler"`. All `.ts`/`.tsx` files use `import` / `export` — no `require()` in `src/`.
- **TypeScript strict mode** is on (`tsconfig.json` → `"strict": true`). Treat any new code as `noImplicitAny` / `strictNullChecks` compatible.
- **Path alias.** `@/*` resolves to `./src/*` (declared in `tsconfig.json` and mirrored in `vitest.config.ts`). Import application code as `@/lib/...`, `@/components/...`, `@/auth`. Use relative imports only inside `src/__tests__/` (tests import `../lib/...`).
- **JSX:** `"jsx": "react-jsx"` — never `import React from 'react'` just for JSX, only when you actually use `React.*`.
- **mcp-server is excluded** from `tsconfig.json` and ESLint — it has its own toolchain.

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` — `AppShell.tsx`, `TeamProvider.tsx`, `TeamSwitcher.tsx`, `RecgonLogo.tsx`, `Toast.tsx`, `Select.tsx`, `ErrorBoundary.tsx`, `ThemeProvider.tsx`.
- Library modules / utilities: camelCase `.ts` — `teamStorage.ts`, `chatStorage.ts`, `analyticsStorage.ts`, `userStorage.ts`, `analysisQuota.ts`, `apiError.ts`, `logger.ts`, `commitSummary.ts`, `appContext.ts`.
- Route segment files: lowercase, Next.js conventions — `route.ts`, `page.tsx`, `layout.tsx`, `loading.tsx`. Dynamic segments use bracket folders `[id]`. Multi-word segment files use kebab-case (e.g. `src/app/projects/[id]/tasks/list-view.tsx`).
- Tests: `*.test.ts` co-located in `src/__tests__/` (never beside the source file). Example: `src/__tests__/schemas.test.ts`.

**Functions:**
- `camelCase` for everything exported from `src/lib/` — `getAllProjects`, `verifyTeamAccess`, `chatViaChain`, `parseAIResponse`, `enqueueJob`.
- Async functions return `Promise<T>` explicitly when the public type matters (see `verifyTeamAccess(teamId: string, userId: string): Promise<string | null>` in `src/lib/teamStorage.ts`).
- Test-only escape hatches: namespace under `__testing` (see `src/lib/recgon/brain.ts` → `__testing.nextStepsFromProject`).

**Variables:**
- `camelCase` for locals, `UPPER_SNAKE_CASE` for module-level constants (`REQUEST_TIMEOUT_MS`, `GEMINI_MODEL_CHAIN`, `MAX_ANALYSES`, `COOLDOWN_MS`).

**Types & interfaces:**
- `PascalCase`. Prefer `interface` for object shapes that are exported as data contracts (`Team`, `TeamMember`, `TeamInvitation`) and `type` for unions/aliases (`Level`, `ChatOptions`, `LLMProvider`).
- Zod-derived types live next to the schema; usually inferred with `z.infer<typeof Schema>` instead of redeclared by hand.

## Code Style

**Formatting:**
- No `.prettierrc` / `prettier.config.*` file is present. Code style is enforced solely by ESLint + `next/core-web-vitals` and editor defaults. Style conventions visible across the codebase:
  - 2-space indentation.
  - Single quotes for strings; backticks for template literals.
  - Trailing commas in multiline literals and parameter lists.
  - Semicolons at end of statement.
  - Arrow functions for callbacks; named `function` for top-level helpers and React components.

**Linting:**
- `.eslintrc.json` — extends `next/core-web-vitals` only. No custom rules.
- `ignorePatterns`: `node_modules/`, `.next/`, `out/`, `mcp-server/dist/`, `scripts/`, `supabase/`.
- Run via `npm run lint` (`eslint .`).

## Import Organization

Observed across `src/lib/`, `src/app/api/`, and `src/components/`:

1. Node / third-party modules first — `next/server`, `next-auth`, `zod`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `@google/generative-ai`, `crypto`, `fs`, `path`.
2. App imports via `@/` alias — `@/auth`, `@/lib/storage`, `@/lib/apiError`, `@/lib/teamStorage`, `@/lib/userStorage`.
3. Type-only imports inline with `import type` when needed (`import type { SupabaseClient } from '@supabase/supabase-js'`, `import type { Project } from './storage'`).

Tests use relative `../lib/...` paths instead of `@/` — both work, the alias is just convention for app code.

## Project Rules (Non-Negotiable)

These rules are stated in `CLAUDE.md` and enforced by convention across the repo. Treat violations as bugs.

- **All prompts in `src/lib/prompts.ts`.** Never inline a system or user prompt in a route handler, worker, or component. Callers import a named prompt builder (e.g. `buildAnalysisPrompt`) and pass arguments. `src/lib/prompts.ts` is the single source of truth for what the model sees.
- **All schemas in `src/lib/schemas.ts`.** Zod schemas (`AnalysisResultSchema`, `InstagramContentSchema`, `TikTokContentSchema`, `GoogleAdsContentSchema`, `CampaignPlanResponseSchema`, `AnalyticsInsightsSchema`, etc.) and the JSON-coercion helper `parseAIResponse` live here. Never inline a `z.object({ ... })` next to a route handler — define it in `schemas.ts` and import it.
- **UI primitives via Radix.** Use `@radix-ui/react-*` (dialog, dropdown-menu, tooltip, popover, tabs, select, etc.) and `@radix-ui/themes` (`Box`, `Flex`, `Text`, `Button`, `Card`) instead of hand-rolling accessible interactive components. The `package.json` already pulls in every Radix primitive you'd need.
- **Server-only Supabase.** `src/lib/supabase.ts` reads `SUPABASE_SERVICE_ROLE_KEY` at request time. **Never import it from a `'use client'` file or expose it via a client bundle.** All DB access goes through server modules (`src/lib/storage.ts`, `src/lib/teamStorage.ts`, `src/lib/userStorage.ts`, `src/lib/chatStorage.ts`, `src/lib/analyticsStorage.ts`, `src/lib/analysisQuota.ts`, `src/lib/integrationStorage.ts`, etc.), which are then called from `route.ts` handlers, server actions, or workers.
- **Team-scoped data model.** Every storage call that touches a tenant resource must take `teamId` (and usually `userId`). Verify access **before** any read/write:

  ```ts
  // src/app/api/projects/route.ts
  const teamId = request.nextUrl.searchParams.get('teamId');
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 });

  const role = await verifyTeamAccess(teamId, session.user.id);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const projects = await getAllProjects(teamId, session.user.id);
  ```

  - `verifyTeamAccess(teamId, userId)` returns the role string or `null` — use for reads (`src/lib/teamStorage.ts:412`).
  - `verifyTeamWriteAccess(teamId, userId)` returns a boolean (owner/member) — use before writes (`src/lib/teamStorage.ts:422`).
  - User-scoped reads must also pass `userId` so non-shared rows don't leak (see `src/lib/storage.ts` filter on `is_shared === false && row.created_by !== userId`).

## Error Handling

**API routes:** authentication first, validation second, business logic in a `try { ... } catch` that delegates to `serverError`.

```ts
// src/app/api/projects/route.ts
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    // ... validate, verifyTeamWriteAccess, do work ...
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return serverError('POST /api/projects', error);
  }
}
```

- `src/lib/apiError.ts` exports:
  - `ApiError extends Error` — throw with a `(message, status)` when you want a specific code surfaced verbatim.
  - `serverError(route, err)` — single sink for 5xx responses. Recognizes Gemini 503/overload (returns 503 with a friendly message), 429 / quota (returns 429), `ApiError` (returns its status). Everything else is logged via `logger.error` and returned as a generic `{ error: 'Internal server error' }` 500. Never leak raw error messages.
- **Validation:** zod schemas from `src/lib/schemas.ts`. For AI output specifically, `parseAIResponse(raw, schema)` strips ``` ```json ``` fences, extracts JSON from prose, and throws on schema mismatch.
- **Status codes used:** 200/201 success · 400 client error (missing field, bad input) · 401 unauthenticated · 403 wrong team / no access · 429 rate limited · 503 model overloaded · 500 catch-all.

**Library code:** throw concrete `Error` objects with a prefixed message so `apiError.ts` and `withRetry` can pattern-match. Examples:
- `cloneGitHubRepo` throws messages starting with `Repository`, `GitHub`, `Invalid GitHub`, `Could not parse`, or `Failed to download` — the route checks for these prefixes and forwards them as 400 instead of 500.
- LLM provider errors include `503`, `529`, `429`, or `overloaded` / `quota` strings so `isOverloaded` / `isRateLimited` (`src/lib/llm/utils.ts`) classify them correctly.

## Logging

**Logger:** `src/lib/logger.ts` exports a singleton `logger` with `debug` / `info` / `warn` / `error` methods. Always import this instead of calling `console.*` directly.

```ts
import { logger } from '@/lib/logger';

logger.warn(`Gemini overloaded, retrying in ${delay}ms`);
logger.error('POST /api/projects failed', err);
```

**Rules baked into the logger comment header (`src/lib/logger.ts:1-10`):**
- Threshold via `LOG_LEVEL` env (`debug` | `info` | `warn` | `error`; default `info` in prod, `debug` in dev).
- **Never log raw model outputs, request bodies, tokens, or PII.** Pass small tagged metadata objects: `logger.info('claimed job', { jobId, kind, attempt })`.
- `Error` instances get short-formatted as `${name}: ${message}` automatically.

## LLM Call Patterns

All LLM access funnels through `src/lib/llm/providers.ts`. Pick the right entry point:

| Entry point | When to use |
|---|---|
| `chat(systemPrompt, userPrompt, options?)` | Backwards-compatible single-provider Gemini call (`src/lib/gemini.ts` re-exports it for legacy callers). |
| `chatViaProviders([providers], sys, user, opts?)` | Explicit provider list, no built-in chain. |
| `chatViaChain(providers, sys, user, opts?, breaker?)` | **Default for new code.** Walks Gemini → Claude, integrates the circuit breaker, classifies recoverable vs fatal errors, records success/failure per provider. |
| `chatHedged(...)` | Adaptive hedging for interactive non-streaming calls (only when latency matters and idempotency is safe). |

Supporting utilities in `src/lib/llm/utils.ts`:
- `withRetry(fn, retries?, label?)` — exponential backoff for overload (3000·2^n ms) and rate-limit (5000·(n+1) ms) errors, jittered, capped at 20 s. Re-throws non-recoverable errors immediately.
- `withTimeout(promise, ms)` — wraps a promise with a hard timeout. `REQUEST_TIMEOUT_MS = 90_000` is the default for LLM requests.
- `isOverloaded`, `isRateLimited`, `isRecoverable` — message-based error classifiers used by retry / breaker / fallback logic.

Circuit breaker: `src/lib/llm/circuitBreaker.ts` exposes `shouldTry(provider) / recordSuccess(provider) / recordFailure(provider)`. 5 failures in 30 s opens the breaker for 60 s; fail-open on breaker errors; 10 s in-process cache on the happy path. `chatViaChain` already wires this in — only call it directly from custom flows.

**Output handling:**
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
  - `src/lib/*Storage.ts` — single-table Supabase access, team-scoped.
  - `src/lib/llm/` — model providers, retry/breaker, job queue, quality gates.
  - `src/lib/tools/` — terminal tool implementations registered in `src/lib/tools/registry.ts`.
  - `src/lib/recgon/` — orchestration brain (brain, scheduler, matcher, learn).
  - `src/lib/terminal/` — slash-command parser for `/v2/terminal`.
- **Client/server split:** any file that touches Supabase, the LLM SDKs, Resend, or `next-auth` must be a server module. Client components are explicitly marked with `'use client';` at the top of the file (`AppShell.tsx`, `Toast.tsx`, `src/app/page.tsx`).

---

*Convention analysis: 2026-05-10*
