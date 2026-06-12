// Shared date/time display helpers.
//
// Relative times are returned as parts ({unit, count}) rather than strings so
// each caller can translate them through its own next-intl namespace. Date
// formatting takes an explicit locale (from useLocale()) — never hardcode
// 'en-US' in pages or components, it breaks the Turkish UI.

export type RelTimeParts = { unit: 'justNow' | 'minutes' | 'hours' | 'days'; count: number };

export function relTimeParts(iso: string | null | undefined): RelTimeParts | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms < 60_000) return { unit: 'justNow', count: 0 };
  if (ms < 3_600_000) return { unit: 'minutes', count: Math.round(ms / 60_000) };
  if (ms < 86_400_000) return { unit: 'hours', count: Math.round(ms / 3_600_000) };
  return { unit: 'days', count: Math.round(ms / 86_400_000) };
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// "Thu, Jun 12" (or the locale's equivalent). Accepts a Date, an ISO datetime,
// or a date-only YYYY-MM-DD string — date-only values are anchored to local
// midnight so the rendered day never shifts across timezones.
export function formatDay(
  value: string | Date | null | undefined,
  locale: string,
  weekday: 'short' | 'long' = 'short',
): string {
  if (!value) return '';
  const d =
    typeof value === 'string'
      ? new Date(DATE_ONLY_RE.test(value) ? `${value}T00:00:00` : value)
      : value;
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(locale, { weekday, month: 'short', day: 'numeric' });
}
