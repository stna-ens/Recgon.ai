import { describe, it, expect, vi } from 'vitest';
import { chatViaChain, type BreakerHooks, type LLMProvider } from '../lib/llm/providers';
import { isOverloaded, isRateLimited } from '../lib/llm/utils';

function makeProvider(name: string, impl: LLMProvider['chat'], configured = true): LLMProvider {
  return {
    name,
    isConfigured: () => configured,
    chat: impl,
  };
}

// Default test breaker — always allows, never records. Keeps tests
// independent of Supabase and of breaker state leaking across cases.
function noBreaker(): BreakerHooks {
  return {
    shouldTry: vi.fn().mockResolvedValue(true),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };
}

describe('chatViaChain', () => {
  it('returns primary provider response when healthy', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"ok":true}'));
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":false}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"ok":true}');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).not.toHaveBeenCalled();
  });

  it('falls through to next provider when primary is overloaded (503)', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('503 Service Unavailable — model overloaded')),
    );
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"fallback":true}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"fallback":true}');
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });

  it('falls through on rate-limit (429)', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('429 Too Many Requests')),
    );
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"fallback":true}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"fallback":true}');
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });

  it('falls through on "high demand" messages', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('The model is experiencing high demand right now')),
    );
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":true}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"ok":true}');
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall through on non-recoverable errors (auth, bad request)', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('401 Unauthorized — invalid API key')),
    );
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"fallback":true}'));

    await expect(
      chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker()),
    ).rejects.toThrow(/401/);
    expect(fallback.chat).not.toHaveBeenCalled();
  });

  it('throws the last provider error when all providers fail with overload', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('503 overloaded')),
    );
    const fallback = makeProvider(
      'fallback',
      vi.fn().mockRejectedValue(new Error('503 also overloaded')),
    );

    await expect(
      chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker()),
    ).rejects.toThrow(/also overloaded/);
    expect(primary.chat).toHaveBeenCalledTimes(1);
    expect(fallback.chat).toHaveBeenCalledTimes(1);
  });

  it('skips providers that are not configured', async () => {
    const primary = makeProvider('primary', vi.fn(), false);
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":true}'));

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker());

    expect(result).toBe('{"ok":true}');
    expect(primary.chat).not.toHaveBeenCalled();
  });

  it('throws a configuration error if no providers are configured', async () => {
    const primary = makeProvider('primary', vi.fn(), false);
    const fallback = makeProvider('fallback', vi.fn(), false);

    await expect(
      chatViaChain([primary, fallback], 'sys', 'user', undefined, noBreaker()),
    ).rejects.toThrow(/No LLM provider configured/);
  });

  it('forwards options to the provider', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"ok":true}'));
    await chatViaChain([primary], 'sys', 'user', { temperature: 0.1, maxTokens: 1234 }, noBreaker());
    expect(primary.chat).toHaveBeenCalledWith('sys', 'user', { temperature: 0.1, maxTokens: 1234 });
  });
});

describe('chatViaChain circuit breaker integration', () => {
  it('skips a provider whose breaker is open, falls to next', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"primary":true}'));
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"fallback":true}'));

    const breaker: BreakerHooks = {
      // primary = open (false), fallback = allowed (true)
      shouldTry: vi.fn(async (p) => p !== 'primary'),
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
    };

    const result = await chatViaChain([primary, fallback], 'sys', 'user', undefined, breaker);

    expect(result).toBe('{"fallback":true}');
    expect(primary.chat).not.toHaveBeenCalled();
    expect(fallback.chat).toHaveBeenCalledTimes(1);
    expect(breaker.recordSuccess).toHaveBeenCalledWith('fallback');
  });

  it('records success on happy path', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"ok":true}'));
    const breaker = noBreaker();

    await chatViaChain([primary], 'sys', 'user', undefined, breaker);

    expect(breaker.recordSuccess).toHaveBeenCalledWith('primary');
    expect(breaker.recordFailure).not.toHaveBeenCalled();
  });

  it('records failure on overload, then success on fallback that works', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('503 overloaded')),
    );
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":true}'));
    const breaker = noBreaker();

    await chatViaChain([primary, fallback], 'sys', 'user', undefined, breaker);

    expect(breaker.recordFailure).toHaveBeenCalledWith('primary');
    expect(breaker.recordSuccess).toHaveBeenCalledWith('fallback');
  });

  it('does NOT record against the breaker on non-recoverable errors', async () => {
    const primary = makeProvider(
      'primary',
      vi.fn().mockRejectedValue(new Error('401 Unauthorized')),
    );
    const breaker = noBreaker();

    await expect(
      chatViaChain([primary], 'sys', 'user', undefined, breaker),
    ).rejects.toThrow(/401/);

    expect(breaker.recordFailure).not.toHaveBeenCalled();
    expect(breaker.recordSuccess).not.toHaveBeenCalled();
  });

  it('throws a distinct error when every provider is circuit-broken', async () => {
    const primary = makeProvider('primary', vi.fn().mockResolvedValue('{"ok":true}'));
    const fallback = makeProvider('fallback', vi.fn().mockResolvedValue('{"ok":true}'));

    const breaker: BreakerHooks = {
      shouldTry: vi.fn().mockResolvedValue(false), // everyone open
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      chatViaChain([primary, fallback], 'sys', 'user', undefined, breaker),
    ).rejects.toThrow(/circuit-broken/);

    expect(primary.chat).not.toHaveBeenCalled();
    expect(fallback.chat).not.toHaveBeenCalled();
  });
});

describe('error classifiers', () => {
  it('isOverloaded matches common overload signals', () => {
    expect(isOverloaded(new Error('503 Service Unavailable'))).toBe(true);
    expect(isOverloaded(new Error('The model is overloaded'))).toBe(true);
    expect(isOverloaded(new Error('Service Unavailable'))).toBe(true);
    expect(isOverloaded(new Error('High demand right now'))).toBe(true);
    expect(isOverloaded(new Error('529 Overloaded'))).toBe(true); // Anthropic overload
    expect(isOverloaded(new Error('401 Unauthorized'))).toBe(false);
  });

  it('isRateLimited matches common rate-limit signals', () => {
    expect(isRateLimited(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRateLimited(new Error('quota exceeded'))).toBe(true);
    expect(isRateLimited(new Error('503 overloaded'))).toBe(false);
  });
});
