import { NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Throw this from API route handlers when you want a specific message and
 * status code surfaced to the client. Anything else thrown is treated as an
 * internal error: logged with detail, returned as a generic 500.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Standard 500 response — never leaks the underlying error message. */
export function serverError(route: string, err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : '';
  // Surface Gemini 503 overload errors with a user-friendly message.
  if (msg.includes('503') || msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overloaded')) {
    return NextResponse.json(
      { error: 'The AI model is temporarily overloaded. Please try again in a moment.' },
      { status: 503 },
    );
  }
  // Surface Gemini 429 rate limit errors with a user-friendly message.
  if (msg.includes('429') || msg.toLowerCase().includes('too many requests') || msg.toLowerCase().includes('quota')) {
    return NextResponse.json(
      { error: 'AI rate limit reached. Please wait a moment and try again.' },
      { status: 429 },
    );
  }
  logger.error(`${route} failed`, err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
