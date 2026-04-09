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
  logger.error(`${route} failed`, err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
