# Testing Patterns

**Analysis Date:** 2026-05-10

## Test Framework

**Runner:**
- Vitest `^4.1.0` (`devDependencies` in `package.json`).
- Config: `vitest.config.ts` — `globals: true`, excludes `node_modules`, `.next`, `.claude/worktrees`. Path alias `@` → `./src` mirrors `tsconfig.json`.
- `globals: true` means `describe`, `it`, `expect`, `vi`, `beforeEach` are available without import — but every existing test still imports them explicitly from `vitest` (e.g. `import { describe, it, expect, vi, beforeEach } from 'vitest'`). Keep doing that; it makes the test file portable and self-documenting.

**Assertion Library:**
- Vitest's built-in `expect` (Jest-compatible API: `toBe`, `toEqual`, `toContain`, `toHaveLength`, `toHaveBeenCalledWith`, `toHaveBeenCalledTimes`, `rejects.toThrow`, etc.).

**Run Commands:**
```bash
npm run test            # vitest run — single CI-style pass
npm run test:watch      # vitest — interactive watch mode
npm run validate        # lint + test + build, the pre-merge gate
npm run eval:llm        # node scripts/llm-eval.mjs — separate LLM quality eval (not vitest)
```

## Test File Organization

**Location:**
- All tests live in `src/__tests__/`. Tests are **not** co-located next to source files.
- Test fixtures go in `src/__tests__/fixtures/` — only `llmEvalFixtures.ts` exists today, used by the LLM eval script.

**Naming:**
- `<subject>.test.ts` — subject usually maps 1:1 to a source module (`schemas.test.ts` → `src/lib/schemas.ts`, `providers.test.ts` → `src/lib/llm/providers.ts`).
- Cross-cutting integration-style tests use a domain name rather than a single module: `unifiedBrain.test.ts` asserts wiring across `src/lib/tools/registry`, `src/lib/appContext`, and several route/component files at once.

**Current test files (`src/__tests__/`):**
- `analysisQuota.test.ts` — quota math (logic copy, no Supabase).
- `jobQueue.test.ts` — `llm_jobs` queue helpers.
- `llmQuality.test.ts` — `src/lib/llm/quality.ts` (mocks `../lib/gemini`).
- `providers.test.ts` — `chatViaChain` fallback + circuit-breaker integration.
- `rateLimit.test.ts` — rate-limit logic copy.
- `recgonBrain.test.ts` — `src/lib/recgon/brain.ts` via `__testing` namespace.
- `recgonCalendarScheduler.test.ts`, `recgonScheduled.test.ts`, `recgonMatch.test.ts`, `recgonLearn.test.ts` — Recgon orchestration brain helpers.
- `schemas.test.ts` — zod schemas + `parseAIResponse`.
- `sourceProfiles.test.ts` — verification source profile registry.
- `terminalCommands.test.ts` — slash-command parser for `/v2/terminal`.
- `unifiedBrain.test.ts` — integration: tool registry + cross-surface project context + `cache: 'no-store'` / `userId` scoping invariants by reading source files with `fs.readFileSync`.
- `waitlist.test.ts` — landing waitlist helper.

**Not present:** feedback-feature tests (`feedbackContent.test.ts`, `feedbackWorkspace.test.ts`) were deleted alongside the feedback feature removal — do not re-add them or reference them in planning.

## Test Structure

Every test file follows the same skeleton: explicit vitest imports, one `describe` per public function or behavioural group, `it` names that read as English sentences describing observable behaviour.

```ts
// src/__tests__/providers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { chatViaChain, type BreakerHooks, type LLMProvider } from '../lib/llm/providers';

describe('chatViaChain', () => {
  it('returns primary provider response when healthy', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"ok":true}'));
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":false}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"ok":true}');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).not.toHaveBeenCalled();
  });
});
```

**Patterns observed:**
- Arrange / Act / Assert with blank-line separation inside each `it`.
- Helper factories defined at file scope (e.g. `makeProvider`, `noBreaker`, `project(overrides)`, `daysAgo(n)`) rather than via `beforeEach`.
- `beforeEach` only used to reset mock state (`chatMock.mockReset()`) or to rebuild a fresh in-memory store (`store = new Map()` in `rateLimit.test.ts`).
- `__testing` namespace export pattern: tests reach internal helpers via `import { __testing } from '../lib/recgon/brain'` and call `__testing.nextStepsFromProject(...)`. Use this to expose internals **without** widening the public API.

## Mocking

**Framework:** Vitest's `vi.fn()` / `vi.mock()`.

**Module mocking pattern (`llmQuality.test.ts`):**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const chatMock = vi.fn();

vi.mock('../lib/gemini', () => ({
  chat: (...args: unknown[]) => chatMock(...args),
}));

describe('llm quality validators', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('repairs valid JSON shape that fails task quality checks', async () => {
    chatMock
      .mockResolvedValueOnce(JSON.stringify({ caption: 'Improve UX', hashtags: '#startup' }))
      .mockResolvedValueOnce(JSON.stringify({ caption: 'Founder teams ...', hashtags: '#founder' }));

    const result = await generateStructuredOutput({ ... });

    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][1]).toContain('QUALITY ISSUES');
  });
});
```

**Inline dependency-injection pattern (`providers.test.ts`):**

Rather than mocking the circuit-breaker module, the test passes a `BreakerHooks` object whose methods are `vi.fn()`s. This keeps the test independent of Supabase and avoids breaker state leaking between cases.

```ts
function noBreaker(): BreakerHooks {
  return {
    shouldTry: vi.fn().mockResolvedValue(true),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };
}
```

**What to mock:**
- LLM SDKs (Gemini, Anthropic) — via `vi.mock('../lib/gemini', ...)` or by injecting a fake `LLMProvider`.
- The circuit-breaker hooks — inject `BreakerHooks` rather than mocking the module.
- HTTP / external integrations (GitHub, Firecrawl, Resend, GA4) — mock at the module boundary.

**What NOT to mock:**
- Zod schemas — exercise them directly.
- Pure logic in `src/lib/recgon/*` — call exported (or `__testing`) functions with real inputs.
- The Supabase client — the existing pattern is to **avoid touching it from tests**. Either:
  - Copy the pure logic into the test file and assert against the copy (see `analysisQuota.test.ts`, `rateLimit.test.ts` — both reimplement the function under test in the file), or
  - Read source files with `fs.readFileSync` and assert on substrings (see `unifiedBrain.test.ts` — verifies `cache: 'no-store'`, `getAllProjects(teamId, session.user.id)`, `resolveProject(..., ctx.userId)` invariants statically).

## Fixtures and Factories

**Test data:**
- Inline literal objects when small (see `schemas.test.ts` `validAnalysis`).
- File-scoped factory functions when many tests need slight variations:

  ```ts
  // src/__tests__/recgonBrain.test.ts
  function project(overrides: Partial<Project>): Project {
    return {
      id: 'p1', teamId: 't1', createdBy: 'u1', name: 'Test',
      sourceType: 'description', description: 'Test project',
      createdAt: '2026-01-01',
      ...overrides,
    } as Project;
  }
  ```

- Shared fixtures for cross-test reuse live in `src/__tests__/fixtures/`. Currently only `llmEvalFixtures.ts` (consumed by `scripts/llm-eval.mjs`, not by vitest).

## Coverage

- **No coverage threshold enforced.** `vitest.config.ts` does not configure `coverage`, and `package.json` has no `test:coverage` script.
- To inspect coverage locally: `npx vitest run --coverage` (will prompt to install the `@vitest/coverage-*` provider on first run).

**What is tested:**
- Pure logic in `src/lib/recgon/*`, `src/lib/terminal/commands.ts`, `src/lib/schemas.ts`, `src/lib/llm/quality.ts`, `src/lib/llm/providers.ts` (`chatViaChain`).
- Job queue helpers in `src/lib/llm/jobQueue.ts`.
- Cross-file invariants for tool wiring and team/user scoping (`unifiedBrain.test.ts`).

**What is not tested:**
- React components (`src/components/`) — no `@testing-library/react` setup, no `jsdom` environment configured.
- Next.js route handlers in `src/app/api/**/route.ts` are not exercised end-to-end; their team-access pattern is asserted statically via `unifiedBrain.test.ts`.
- Live Supabase, Gemini, Claude, GA4, GitHub, Firecrawl, Resend calls — all external integrations are mocked or bypassed.

## Test Types

**Unit tests:**
- Default style for everything in `src/__tests__/`. Test one module's public surface, mock its dependencies, assert behaviour.

**Integration tests:**
- `unifiedBrain.test.ts` is the closest thing to integration: it reads multiple source files with `fs.readFileSync(path.join(root, file), 'utf8')` and asserts on substrings that prove cross-cutting invariants hold (no-store fetches, user-scoped storage calls, no Gemini-incompatible JSON-schema keys, MCP token routing). Reuse this pattern whenever a rule spans many files but can be reduced to a static check.

**E2E tests:**
- None. No Playwright / Cypress setup in `package.json`.

## Common Patterns

**Async testing:**
```ts
it('falls through to next provider when primary is overloaded (503)', async () => {
  const primary = makeProvider('primary', vi.fn().mockRejectedValue(new Error('503 Service Unavailable')));
  const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"fallback":true}'));

  const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

  expect(result).toBe('{"fallback":true}');
});
```

**Error testing:**
```ts
// Synchronous throw
expect(() => parseAIResponse('no json here', simpleSchema)).toThrow('No JSON found');

// Async rejection — note the .rejects matcher and regex
await expect(
  chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker()),
).rejects.toThrow(/401/);
```

**Discriminated-union narrowing in tests (`terminalCommands.test.ts`):**
```ts
const result = parseCommand('/analyze sublime');
expect(result.kind).toBe('slash');
if (result.kind === 'slash') {
  expect(result.command.name).toBe('/analyze');
  expect(result.apiText).toContain('analyze_code');
}
```
Re-narrow inside the test body with an `if (result.kind === '...')` guard — keeps the assertions type-safe without casts.

**Source-file invariant assertion (`unifiedBrain.test.ts`):**
```ts
import { readFileSync } from 'fs';
import path from 'path';
const root = process.cwd();

const source = readFileSync(path.join(root, 'src/app/api/overview/route.ts'), 'utf8');
expect(source).toContain('getAllProjects(teamId, session.user.id)');
```
Use this to lock down cross-cutting rules (team scoping, user scoping, cache headers, no-store fetches) that linters can't enforce.

---

*Testing analysis: 2026-05-10*
