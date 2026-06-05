// First-run onboarding helpers.
//
// A team is in "first-run" state when it has zero projects and the user
// hasn't dismissed the welcome checklist. The dismiss flag is persisted in
// localStorage, scoped per team so switching teams gets its own state.

/** Pure predicate: show the first-run checklist? */
export function shouldShowFirstRun(input: {
  projectCount: number;
  dismissed: boolean;
}): boolean {
  return input.projectCount === 0 && !input.dismissed;
}

const DISMISS_PREFIX = 'recgon.firstrun.dismissed.';

function dismissKey(teamId: string): string {
  return `${DISMISS_PREFIX}${teamId}`;
}

/** Has the user dismissed the first-run checklist for this team? */
export function isFirstRunDismissed(teamId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(dismissKey(teamId)) === '1';
  } catch {
    // localStorage can throw in private mode / when disabled — treat as not dismissed.
    return false;
  }
}

/** Persist that the user dismissed the first-run checklist for this team. */
export function dismissFirstRun(teamId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(dismissKey(teamId), '1');
  } catch {
    // Best-effort; if storage is unavailable the panel simply reappears.
  }
}
