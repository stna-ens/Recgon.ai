/**
 * Minimal structured logger.
 *
 * Wraps console.* with a level threshold so we can dial logging down in
 * production without rewriting every call site. Set LOG_LEVEL=debug|info|warn|error
 * (default: info in prod, debug in dev).
 *
 * Do NOT log raw model outputs, request bodies, tokens, or PII. Pass small,
 * tagged objects (`{ userId, route, status }`) and short messages.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): number {
  const env = (process.env.LOG_LEVEL as Level | undefined)?.toLowerCase() as Level | undefined;
  if (env && env in LEVELS) return LEVELS[env];
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
}

function emit(level: Level, message: string, meta?: unknown) {
  if (LEVELS[level] < currentLevel()) return;
  const line = meta === undefined ? message : `${message} ${safeStringify(meta)}`;
  // eslint-disable-next-line no-console
  (console[level === 'debug' ? 'log' : level] as (...args: unknown[]) => void)(`[${level}] ${line}`);
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
