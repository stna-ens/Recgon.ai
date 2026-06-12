import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { getUserById, type Language } from '@/lib/userStorage';

export const SUPPORTED_LOCALES: Language[] = ['en', 'tr'];
export const DEFAULT_LOCALE: Language = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

// Every translation namespace. Each lives in messages/<locale>/<ns>.json so
// sections can be translated independently without merge conflicts.
const NAMESPACES = [
  'common',
  'nav',
  'shared',
  'home',
  'projects',
  'tasks',
  'command',
  'calendar',
  'teams',
  'settings',
  'auth',
  'marketing',
  'analytics',
  'terminal',
  'landing',
] as const;

function normalize(value: string | undefined | null): Language | null {
  return value === 'en' || value === 'tr' ? value : null;
}

async function loadMessages(locale: Language): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      try {
        const mod = await import(`../../messages/${locale}/${ns}.json`);
        return [ns, mod.default] as const;
      } catch {
        return [ns, {}] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Resolves the active UI locale, then loads + merges all namespace files.
 *
 * Locale order: cookie (fast, no DB) -> stored user preference -> 'en'.
 *
 * Missing-message handling is fail-soft: a key absent from the active locale
 * falls back to the English value, and if that is also missing we render the
 * key itself instead of throwing. This is what lets us roll the UI translation
 * out section-by-section without ever crashing a page that isn't covered yet.
 */
export default getRequestConfig(async () => {
  let locale: Language | null = null;

  const cookieStore = await cookies();
  locale = normalize(cookieStore.get(LOCALE_COOKIE)?.value);

  if (!locale) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const user = await getUserById(session.user.id);
        locale = normalize(user?.language);
      }
    } catch {
      // auth()/DB unavailable (e.g. static context) — fall through to default.
    }
  }

  const resolved = locale ?? DEFAULT_LOCALE;
  const messages = await loadMessages(resolved);

  // English fallback table for keys not yet translated in the active locale.
  const fallback = resolved === 'en' ? null : await loadMessages(DEFAULT_LOCALE);

  return {
    locale: resolved,
    messages,
    onError() {
      // Swallow MISSING_MESSAGE etc. — getMessageFallback handles display.
    },
    getMessageFallback({ key, namespace }) {
      const path = namespace ? `${namespace}.${key}` : key;
      if (fallback) {
        const fromEnglish = path
          .split('.')
          .reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), fallback);
        if (typeof fromEnglish === 'string') return fromEnglish;
      }
      return path;
    },
  };
});
