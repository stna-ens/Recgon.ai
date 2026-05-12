// Phase 2 shared LLM stub. Mirrors the Phase 1 pattern from
// `llmQuality.test.ts` and `profileNormalization.test.ts`: swap
// `chatViaChain` at the module level via `vi.mock`, then call
// `stubChatViaChain(response)` inside each test to set the return value.
//
// Usage in a test file:
//
//   import { vi } from 'vitest';
//   vi.mock('@/lib/llm/providers', async () => {
//     const actual = await vi.importActual<typeof import('@/lib/llm/providers')>(
//       '@/lib/llm/providers',
//     );
//     return { ...actual, chatViaChain: vi.fn() };
//   });
//   import { chatViaChain } from '@/lib/llm/providers';
//   import { stubChatViaChain } from './mocks/llm';
//
//   // inside `it`:
//   stubChatViaChain(chatViaChain, { skills: [{ canonical: 'frontend', confidence: 0.9, evidence: 1 }] });

import { vi } from 'vitest';

type Mocked = ReturnType<typeof vi.fn>;

/**
 * Set the next resolved value of an already-mocked `chatViaChain`.
 * Accepts a string (returned verbatim) or an object (JSON-stringified).
 */
export function stubChatViaChain(
  mocked: unknown,
  response: string | object,
): void {
  const fn = mocked as Mocked;
  if (typeof fn !== 'function' || typeof fn.mockResolvedValueOnce !== 'function') {
    throw new Error(
      'stubChatViaChain: pass the mocked chatViaChain reference (after vi.mock).',
    );
  }
  const value = typeof response === 'string' ? response : JSON.stringify(response);
  fn.mockResolvedValueOnce(value);
}

/**
 * Set the next rejection of an already-mocked `chatViaChain`.
 * Used by tests that exercise the LLM-failure-safe fallback path.
 */
export function stubChatViaChainFailure(
  mocked: unknown,
  error: Error = new Error('llm failure (test stub)'),
): void {
  const fn = mocked as Mocked;
  if (typeof fn !== 'function' || typeof fn.mockRejectedValueOnce !== 'function') {
    throw new Error('stubChatViaChainFailure: pass the mocked chatViaChain reference.');
  }
  fn.mockRejectedValueOnce(error);
}

/**
 * Reset the mocked chatViaChain. Call inside `beforeEach`.
 */
export function resetChatViaChain(mocked: unknown): void {
  const fn = mocked as Mocked;
  if (typeof fn?.mockReset === 'function') fn.mockReset();
}
