// Validates required environment variables at startup.
// Call validateEnv() at the top of any API route that needs Gemini.

const REQUIRED = ['GEMINI_API_KEY'] as const;

export function validateEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
      `Add them to .env.local and restart the server.`
    );
  }
}
