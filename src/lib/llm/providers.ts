import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../logger';
import {
  isOverloaded,
  isRateLimited,
  withRetry,
  withTimeout,
  REQUEST_TIMEOUT_MS,
} from './utils';
import { shouldTry, recordSuccess, recordFailure } from './circuitBreaker';

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  taskKind?: string;
  promptVersion?: string;
  qualityProfile?: string;
  allowRepairRetry?: boolean;
};

export type LLMProvider = {
  name: string;
  isConfigured(): boolean;
  chat(systemPrompt: string, userPrompt: string, options?: ChatOptions): Promise<string>;
};

// ── Gemini ──────────────────────────────────────────────────────────────────

const GEMINI_MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

let geminiClient: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }
  return geminiClient;
}

export const geminiProvider: LLMProvider = {
  name: 'gemini',
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  },
  async chat(systemPrompt, userPrompt, options) {
    const client = getGeminiClient();
    let lastErr: unknown;
    for (const modelName of GEMINI_MODEL_CHAIN) {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });
      try {
        const content = await withRetry(
          () =>
            withTimeout(
              model.generateContent({
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: {
                  temperature: options?.temperature ?? 0.7,
                  maxOutputTokens: options?.maxTokens ?? 8192,
                  responseMimeType: 'application/json',
                },
              }),
              REQUEST_TIMEOUT_MS,
            ),
          3,
          `gemini/${modelName}`,
        );
        const text = content.response.text();
        if (modelName !== GEMINI_MODEL_CHAIN[0]) {
          logger.warn('gemini fallback model served request', {
            model: modelName,
            taskKind: options?.taskKind,
            promptVersion: options?.promptVersion,
          });
        }
        logger.debug('gemini response received', {
          model: modelName,
          taskKind: options?.taskKind,
          promptVersion: options?.promptVersion,
        });
        return text;
      } catch (err) {
        lastErr = err;
        if (isOverloaded(err)) {
          logger.warn('gemini model overloaded, trying next', {
            model: modelName,
            taskKind: options?.taskKind,
            promptVersion: options?.promptVersion,
          });
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('All Gemini models failed');
  },
};

// ── Claude (Anthropic) ──────────────────────────────────────────────────────

const CLAUDE_MODEL_CHAIN = ['claude-haiku-4-5'];

const JSON_GUARD = '\n\nIMPORTANT: Respond with a single valid JSON value. Do NOT wrap the response in markdown code fences. Do NOT include any prose before or after the JSON.';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  }
  return anthropicClient;
}

export const claudeProvider: LLMProvider = {
  name: 'claude',
  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  async chat(systemPrompt, userPrompt, options) {
    const client = getAnthropicClient();
    let lastErr: unknown;
    for (const modelName of CLAUDE_MODEL_CHAIN) {
      try {
        const res = await withRetry(
          () =>
            withTimeout(
              client.messages.create({
                model: modelName,
                system: systemPrompt + JSON_GUARD,
                max_tokens: options?.maxTokens ?? 8192,
                temperature: options?.temperature ?? 0.7,
                messages: [
                  { role: 'user', content: userPrompt },
                  // Prefill the assistant turn with `{` so Claude commits to a
                  // JSON object and can't prepend prose. We prepend `{` back
                  // onto the returned text before handing it to the caller.
                  { role: 'assistant', content: '{' },
                ],
              }),
              REQUEST_TIMEOUT_MS,
            ),
          3,
          `claude/${modelName}`,
        );
        const block = res.content.find((b) => b.type === 'text');
        const body = block && block.type === 'text' ? block.text : '';
        logger.debug('claude response received', {
          model: modelName,
          taskKind: options?.taskKind,
          promptVersion: options?.promptVersion,
        });
        return '{' + body;
      } catch (err) {
        lastErr = err;
        if (isOverloaded(err)) {
          logger.warn('claude model overloaded, trying next', {
            model: modelName,
            taskKind: options?.taskKind,
            promptVersion: options?.promptVersion,
          });
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('All Claude models failed');
  },
};

// ── Provider chain ──────────────────────────────────────────────────────────

export const PROVIDER_CHAIN: LLMProvider[] = [geminiProvider, claudeProvider];

// Orchestration extracted so tests can pass in mock providers.
//
// Circuit breaker integration: before calling each provider we ask the
// shared breaker (Supabase-backed) whether this provider is currently
// open. If so, we skip straight to the next — we don't want every
// Vercel instance independently burning a 90s timeout on a provider
// that's already known to be degraded.
//
// Breaker writes (`recordSuccess` / `recordFailure`) are fire-and-forget
// (`void`) so we don't add Supabase latency to the caller's path.
//
// Tests inject a `breaker` override to bypass the global breaker and
// run synchronously against mock state.
export type BreakerHooks = {
  shouldTry(provider: string): Promise<boolean>;
  recordSuccess(provider: string): Promise<void>;
  recordFailure(provider: string): Promise<void>;
};

const defaultBreaker: BreakerHooks = { shouldTry, recordSuccess, recordFailure };

export async function chatViaChain(
  chain: LLMProvider[],
  systemPrompt: string,
  userPrompt: string,
  options?: ChatOptions,
  breaker: BreakerHooks = defaultBreaker,
): Promise<string> {
  const configured = chain.filter((p) => p.isConfigured());
  if (configured.length === 0) {
    throw new Error('No LLM provider configured. Set GEMINI_API_KEY and/or ANTHROPIC_API_KEY.');
  }

  let lastErr: unknown;
  let skippedAll = true;
  for (let i = 0; i < configured.length; i++) {
    const provider = configured[i];

    // Check circuit breaker. On `false` we skip — the provider is currently
    // open; trying it would just burn a timeout.
    const allowed = await breaker.shouldTry(provider.name);
    if (!allowed) {
      logger.debug('circuit breaker skipping provider', { provider: provider.name });
      continue;
    }
    skippedAll = false;

    try {
      const result = await provider.chat(systemPrompt, userPrompt, options);
      if (i > 0) {
        logger.warn('LLM served by fallback provider', {
          provider: provider.name,
          taskKind: options?.taskKind,
          promptVersion: options?.promptVersion,
        });
      } else {
        logger.debug('LLM response received', {
          provider: provider.name,
          taskKind: options?.taskKind,
          promptVersion: options?.promptVersion,
        });
      }
      void breaker.recordSuccess(provider.name);
      return result;
    } catch (err) {
      lastErr = err;
      if (isOverloaded(err) || isRateLimited(err)) {
        logger.warn('provider unavailable, trying next', {
          provider: provider.name,
          taskKind: options?.taskKind,
          promptVersion: options?.promptVersion,
          reason: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
        });
        void breaker.recordFailure(provider.name);
        continue;
      }
      // Non-recoverable (auth, bad request, schema violation) — propagate
      // immediately; trying another provider won't help, and this isn't a
      // provider-health signal so we don't record it against the breaker.
      throw err;
    }
  }
  if (skippedAll) {
    // Every provider was open. Fail closed with a message distinct from
    // "all providers errored" so ops can tell the difference in logs.
    throw new Error('All LLM providers are circuit-broken; skipping to avoid piling on.');
  }
  throw lastErr ?? new Error('All LLM providers failed');
}

export function chatViaProviders(
  systemPrompt: string,
  userPrompt: string,
  options?: ChatOptions,
): Promise<string> {
  return chatViaChain(PROVIDER_CHAIN, systemPrompt, userPrompt, options);
}

// ── Adaptive hedging ────────────────────────────────────────────────────────
//
// For interactive non-streaming calls (marketing, analytics, overview brief,
// social), we can pay a small cost — firing Claude in parallel after a short
// delay — to slash tail latency when Gemini is slow but not outright failing.
// On the happy path (Gemini responds < hedgeAfterMs) Claude never starts, so
// cost is unchanged. On the degraded path we take whichever returns first.
//
// Not used by batch (queue handles it) or streaming (hedging a mid-stream
// switch is much more invasive — punt until needed).
//
// Semantics:
//   - If primary's breaker is open, use normal chain (falls to secondary).
//   - If primary is in `probe` state, we can't tell from shouldTry(), but
//     the cost of an extra hedge call on a potentially-flaky provider is
//     cheap insurance, so we start the hedge immediately instead of waiting
//     the delay. We approximate this by treating any recent local-cache
//     miss + allowed check as "possibly degraded" — good enough.
//   - Losing provider's call continues in the background (no abort). Its
//     own `withTimeout` caps wasted time at REQUEST_TIMEOUT_MS. Acceptable
//     tax for a simpler implementation that doesn't need AbortSignal
//     plumbing through the provider SDKs (Gemini's SDK doesn't cleanly
//     expose it anyway).

export type HedgeOptions = ChatOptions & { hedgeAfterMs?: number };

export async function chatHedged(
  systemPrompt: string,
  userPrompt: string,
  options?: HedgeOptions,
): Promise<string> {
  const hedgeDelay = options?.hedgeAfterMs ?? 3000;
  const configured = PROVIDER_CHAIN.filter((p) => p.isConfigured());

  // Degenerate cases — fall through to the normal chain.
  if (configured.length < 2) {
    return chatViaChain(PROVIDER_CHAIN, systemPrompt, userPrompt, options);
  }

  const [primary, secondary] = configured;

  // Respect breaker state. If primary is open, don't hedge — just use the
  // normal chain ordered with secondary first so the breaker saves us the
  // round-trip.
  const [primaryAllowed, secondaryAllowed] = await Promise.all([
    shouldTry(primary.name),
    shouldTry(secondary.name),
  ]);
  if (!primaryAllowed && !secondaryAllowed) {
    throw new Error('All LLM providers are circuit-broken; skipping to avoid piling on.');
  }
  if (!primaryAllowed) {
    return chatViaChain([secondary, primary], systemPrompt, userPrompt, options);
  }
  if (!secondaryAllowed) {
    // Primary only — no hedge possible. Fall back to chain so we still
    // record success/failure against the breaker.
    return chatViaChain([primary], systemPrompt, userPrompt, options);
  }

  const primaryPromise = primary
    .chat(systemPrompt, userPrompt, options)
    .then((result) => {
      void recordSuccess(primary.name);
      return { winner: primary.name, result };
    })
    .catch((err) => {
      if (isOverloaded(err) || isRateLimited(err)) void recordFailure(primary.name);
      throw err;
    });

  let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
  const secondaryPromise = new Promise<{ winner: string; result: string }>((resolve, reject) => {
    const start = () => {
      secondary
        .chat(systemPrompt, userPrompt, options)
        .then((result) => {
          void recordSuccess(secondary.name);
          resolve({ winner: secondary.name, result });
        })
        .catch((err) => {
          if (isOverloaded(err) || isRateLimited(err)) void recordFailure(secondary.name);
          reject(err);
        });
    };
    hedgeTimer = setTimeout(start, hedgeDelay);
    // If primary resolves first, cancel the hedge so we don't pay for it.
    primaryPromise.then(
      () => {
        if (hedgeTimer) clearTimeout(hedgeTimer);
      },
      () => {
        // Primary failed — fire the hedge immediately if we haven't.
        if (hedgeTimer) {
          clearTimeout(hedgeTimer);
          start();
        }
      },
    );
  });

  try {
    const { winner, result } = await Promise.any([primaryPromise, secondaryPromise]);
    if (winner !== primary.name) {
      logger.warn('hedge won over primary', { winner });
    }
    return result;
  } catch (err) {
    // Both failed. AggregateError.errors[0] is primary's error (matches
    // the order we passed to Promise.any), which is the most informative.
    if (err instanceof AggregateError && err.errors.length > 0) {
      throw err.errors[0];
    }
    throw err;
  }
}
