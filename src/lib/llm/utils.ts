import { logger } from '../logger';

export const REQUEST_TIMEOUT_MS = 90_000;

export function isOverloaded(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('529') ||
    msg.toLowerCase().includes('overloaded') ||
    msg.toLowerCase().includes('high demand') ||
    msg.toLowerCase().includes('service unavailable')
  );
}

export function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('too many requests') ||
    msg.toLowerCase().includes('quota')
  );
}

export function isRecoverable(err: unknown): boolean {
  return isOverloaded(err) || isRateLimited(err);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`LLM request timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  label = 'LLM',
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const overloaded = isOverloaded(err);
      const rateLimited = isRateLimited(err);
      if ((overloaded || rateLimited) && attempt < retries) {
        const baseDelay = rateLimited ? 5000 * (attempt + 1) : 3000 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 700);
        const delay = Math.min(baseDelay + jitter, 20000);
        logger.warn(
          `${label} ${rateLimited ? 'rate limited' : 'overloaded'}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}
