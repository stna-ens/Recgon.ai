// Shared password policy for register, password reset, and change-password.
// One source of truth so the rules can't drift between flows.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/**
 * Returns an error code if the password violates policy, or null if it's fine.
 * Codes (not prose) so API routes and UI can map them to localized messages:
 *   'too_short' | 'too_long' | 'too_uniform'
 */
export function validatePassword(password: string): 'too_short' | 'too_long' | 'too_uniform' | null {
  if (password.length < PASSWORD_MIN) return 'too_short';
  if (password.length > PASSWORD_MAX) return 'too_long';
  // Reject passwords that are a single repeated character ("aaaaaaaa").
  if (new Set(password).size === 1) return 'too_uniform';
  return null;
}
