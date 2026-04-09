// Validates required environment variables.
//
// validateEnv() is the per-request guard for routes that need Gemini.
// validateBootEnv() should be called once at startup to fail fast on misconfig
// (used by `auth.ts` and `supabase.ts` import side-effects).

const GEMINI_REQUIRED = ['GEMINI_API_KEY'] as const;

const BOOT_REQUIRED = [
  'GEMINI_API_KEY',
  'AUTH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const OPTIONAL = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'FIRECRAWL_API_KEY',
  'NEXTAUTH_URL',
  'LOG_LEVEL',
] as const;

export function validateEnv(): void {
  const missing = GEMINI_REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
      `Add them to .env.local and restart the server.`
    );
  }
}

let bootValidated = false;

export function validateBootEnv(): void {
  if (bootValidated) return;
  bootValidated = true;

  // In test/dev tooling we don't want this to throw — only enforce in prod.
  if (process.env.NODE_ENV !== 'production') return;

  const missing = BOOT_REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[boot] Missing required environment variable(s): ${missing.join(', ')}.`
    );
  }
}

// Re-export so the optional list isn't dead — useful for tooling/docs.
export const KNOWN_OPTIONAL_ENV = OPTIONAL;
