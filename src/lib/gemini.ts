import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from './logger';

// Model fallback chain — if the primary model is overloaded / unavailable,
// try the next one in the list before giving up.
const MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const REQUEST_TIMEOUT_MS = 90_000; // 90 s per attempt

function isOverloaded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.toLowerCase().includes('overloaded') ||
    msg.toLowerCase().includes('high demand') ||
    msg.toLowerCase().includes('service unavailable')
  );
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('too many requests') ||
    msg.toLowerCase().includes('quota')
  );
}

// Wraps a promise with a hard timeout. Rejects if the promise doesn't resolve
// within `ms` milliseconds.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gemini request timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const overloaded = isOverloaded(err);
      const rateLimited = isRateLimited(err);
      if ((overloaded || rateLimited) && attempt < retries) {
        // Shorter delays for overload: 3s, 6s, 12s (capped at 20s)
        const baseDelay = rateLimited ? 5000 * (attempt + 1) : 3000 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 700);
        const delay = Math.min(baseDelay + jitter, 20000);
        logger.warn(`Gemini ${rateLimited ? 'rate limited' : 'overloaded'}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export async function chat(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const client = getGeminiClient();

  // Try each model in the fallback chain. If a model is overloaded or
  // unavailable we move to the next one immediately.
  let lastErr: unknown;
  for (const modelName of MODEL_FALLBACK_CHAIN) {
    const model = client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });

    try {
      const content = await withRetry(() =>
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
      );

      const response = await content.response;
      const text = response.text();
      if (modelName !== MODEL_FALLBACK_CHAIN[0]) {
        logger.warn(`Gemini responded via fallback model: ${modelName}`);
      }
      logger.debug('gemini response received', { model: modelName, length: text.length });
      return text;
    } catch (err) {
      lastErr = err;
      if (isOverloaded(err)) {
        // Primary is overloaded — try the next model immediately
        logger.warn(`${modelName} overloaded, trying next fallback model`);
        continue;
      }
      // Any other error (auth, bad request, etc.) — propagate immediately
      throw err;
    }
  }

  // All models failed
  throw lastErr ?? new Error('All Gemini models failed');
}
