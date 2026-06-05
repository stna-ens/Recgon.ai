import type { AnalyticsData, GAProperty, MetricKey, TileMetric, TrendPoint } from './types';

// `labelKey` / `longLabelKey` index into the `analytics.days` namespace so the
// range buttons localize at render time. `value` stays the numeric day count.
export const DAYS_OPTIONS = [
  { labelKey: 'days.label7', longLabelKey: 'days.long7', value: 7 },
  { labelKey: 'days.label30', longLabelKey: 'days.long30', value: 30 },
  { labelKey: 'days.label90', longLabelKey: 'days.long90', value: 90 },
];

// Pink-led spectrum — anchors the v2 visual identity. Used for channels /
// countries / devices. Light + dark mode safe via CSS vars (signature pink
// with alpha steps).
export const PINK_SPECTRUM = [
  'rgba(var(--signature-rgb), 0.92)',
  'rgba(var(--signature-rgb), 0.65)',
  'rgba(var(--signature-rgb), 0.45)',
  'rgba(var(--signature-rgb), 0.30)',
  'rgba(var(--signature-rgb), 0.20)',
  'rgba(var(--signature-rgb), 0.14)',
  'rgba(var(--signature-rgb), 0.10)',
  'rgba(var(--signature-rgb), 0.07)',
];

// Trend gradient strokes — multiple pink-on-pink with progressive alpha so
// we keep one chart identity instead of rainbow (v1 used purple/cyan/green).
export const SESSIONS_STROKE = 'rgba(var(--signature-rgb), 0.95)';
export const USERS_STROKE = 'rgba(var(--txt-pure-rgb, 255, 255, 255), 0.45)';
export const PAGEVIEWS_STROKE = 'rgba(var(--txt-pure-rgb, 255, 255, 255), 0.22)';

export const PERF_COLOR: Record<string, string> = {
  growing: 'var(--success)',
  stable: 'var(--warning)',
  declining: 'var(--danger)',
  insufficient_data: 'var(--txt-faint)',
};

// Maps a performance band to its key in the `analytics.perf` namespace.
// Resolved through useTranslations at render time (header, saved-runs strip).
export const PERF_LABEL_KEY: Record<string, string> = {
  growing: 'perf.growing',
  stable: 'perf.stable',
  declining: 'perf.declining',
  insufficient_data: 'perf.insufficientData',
};

// Parse a raw GA4 error string into a structured set of translation keys.
// Used by AnalyticsError so the user gets actionable, localized instructions
// instead of a stack trace. The `.includes()` matches run against the raw
// (English) GA4 API message — do NOT translate those substrings.
//
// `titleKey` + `stepKeys` index into the `analytics.error` namespace. The
// `fallback` branch has no step keys: the component renders the raw message
// (which is server/API text) verbatim.
export interface AnalyticsErrorDescriptor {
  titleKey: string;
  stepKeys: string[];
  rawStep?: string;
}

export function parseAnalyticsError(raw: string): AnalyticsErrorDescriptor {
  if (raw.includes('PERMISSION_DENIED') || raw.includes('does not have permissions')) {
    return {
      titleKey: 'error.permissionTitle',
      stepKeys: [
        'error.permissionStep1',
        'error.permissionStep2',
        'error.permissionStep3',
        'error.permissionStep4',
        'error.permissionStep5',
      ],
    };
  }
  if (raw.includes('INVALID_ARGUMENT') || raw.includes('Invalid property')) {
    return {
      titleKey: 'error.invalidArgTitle',
      stepKeys: ['error.invalidArgStep1', 'error.invalidArgStep2', 'error.invalidArgStep3'],
    };
  }
  if (raw.includes('UNAUTHENTICATED') || raw.includes('credentials')) {
    return {
      titleKey: 'error.unauthTitle',
      stepKeys: ['error.unauthStep1', 'error.unauthStep2', 'error.unauthStep3'],
    };
  }
  if (raw.includes('has not been used') || raw.includes('disabled')) {
    return {
      titleKey: 'error.apiDisabledTitle',
      stepKeys: ['error.apiDisabledStep1', 'error.apiDisabledStep2', 'error.apiDisabledStep3'],
    };
  }
  return { titleKey: 'error.fallbackTitle', stepKeys: [], rawStep: raw };
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

export function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function fmtDate(iso: string): string {
  if (iso.includes('-')) {
    const [, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  }
  if (iso.length === 8) {
    return `${parseInt(iso.slice(4, 6), 10)}/${parseInt(iso.slice(6, 8), 10)}`;
  }
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Strip trailing punctuation and clean up whitespace from model output. Some
// of our prompts leave an extra period or stray newline.
export function cleanText(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

export function propIdOf(p: GAProperty): string {
  return p.id ?? p.propertyId ?? '';
}

// ─── New for redesign ────────────────────────────────────────────────────

// Compute % change between current and previous values. Returns null when
// the comparison is meaningless (no prior data, or prior was 0).
export function computeDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// Split the trend array in half: the most recent half is "current period",
// the older half is "prior period". GA4 returns the requested window in
// chronological order, so the second half is current.
export function splitTrendForComparison(trend: TrendPoint[]): { current: TrendPoint[]; prior: TrendPoint[] } {
  if (!trend || trend.length < 2) return { current: trend ?? [], prior: [] };
  const mid = Math.floor(trend.length / 2);
  return { prior: trend.slice(0, mid), current: trend.slice(mid) };
}

// Sum a numeric field over a series.
function sumOf(arr: TrendPoint[], key: keyof TrendPoint): number {
  return arr.reduce((acc, p) => acc + (Number(p[key]) || 0), 0);
}

// Build the 5 tiles with deltas + sparkline series. Pulls overview values for
// `current` and computes prior-period sums from the trend split. Sessions /
// users / page views have a real prior to compare against; bounce rate and
// avg session duration are not in the trend payload, so their delta is null
// (UI shows the chip in muted "~" form).
export function buildTileMetrics(data: AnalyticsData): TileMetric[] {
  const o = data.overview;
  const { current, prior } = splitTrendForComparison(data.trend);

  const labels = current.map((p) => fmtDate(p.date));
  const sessionsSeries = current.map((p) => p.sessions);
  const usersSeries = current.map((p) => p.users);
  const pvSeries = current.map((p) => p.pageViews);

  const sessionsDelta = computeDelta(sumOf(current, 'sessions'), sumOf(prior, 'sessions'));
  const usersDelta = computeDelta(sumOf(current, 'users'), sumOf(prior, 'users'));
  const pvDelta = computeDelta(sumOf(current, 'pageViews'), sumOf(prior, 'pageViews'));

  // `label` holds the key into the `analytics.tiles` namespace; the rendering
  // component (AnalyticsTiles) resolves it via useTranslations.
  return [
    {
      key: 'sessions' as MetricKey,
      label: 'tiles.sessions',
      formatted: fmtNumber(o.sessions),
      delta: sessionsDelta,
      series: sessionsSeries,
      seriesLabels: labels,
    },
    {
      key: 'activeUsers' as MetricKey,
      label: 'tiles.activeUsers',
      formatted: fmtNumber(o.activeUsers),
      delta: usersDelta,
      series: usersSeries,
      seriesLabels: labels,
    },
    {
      key: 'screenPageViews' as MetricKey,
      label: 'tiles.pageViews',
      formatted: fmtNumber(o.screenPageViews),
      delta: pvDelta,
      series: pvSeries,
      seriesLabels: labels,
    },
    {
      key: 'bounceRate' as MetricKey,
      label: 'tiles.bounceRate',
      formatted: fmtPct(o.bounceRate),
      delta: null,
      series: [],
      seriesLabels: [],
      inverse: true,
      warn: o.bounceRate > 70,
    },
    {
      key: 'averageSessionDuration' as MetricKey,
      label: 'tiles.avgSession',
      formatted: fmtDuration(o.averageSessionDuration),
      delta: null,
      series: [],
      seriesLabels: [],
    },
  ];
}

// Localization-friendly hero descriptor. The header resolves `kind` +
// `metricLabelKey` + numeric `pct` / `arrow` / `compareKey` through
// useTranslations. `range` is GA4-provided date-range text passed through.
export interface AnalyticsHeroDescriptor {
  kind: 'sessions' | 'metricUp' | 'metricDown' | 'metricSteady' | 'flatDown';
  metricLabelKey?: string;
  range?: string;
  sessions?: string;
  arrow?: string;
  pct?: string;
  compareKey?: string;
  deltaTone?: 'success' | 'danger' | 'faint';
}

// Build the hero headline descriptor from the current data + tile deltas.
// Picks the largest absolute movement and frames it. Falls back gracefully
// when no prior data exists.
export function buildHeroHeadline(
  data: AnalyticsData,
  tiles: TileMetric[],
  perf?: string,
): AnalyticsHeroDescriptor {
  const range = data.dateRange.toLowerCase();
  const movable = tiles.filter((t) => t.delta !== null);

  if (movable.length === 0) {
    return { kind: 'sessions', sessions: fmtNumber(data.overview.sessions), range };
  }

  // Largest absolute delta wins. For "inverse" metrics (bounce rate), invert
  // the sign so an increase reads as bad.
  movable.sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number));
  const star = movable[0];
  const raw = star.delta as number;
  const effective = star.inverse ? -raw : raw;
  const tone: 'success' | 'danger' | 'faint' =
    Math.abs(raw) < 1 ? 'faint' : effective >= 0 ? 'success' : 'danger';
  const arrow = Math.abs(raw) < 1 ? '~' : raw > 0 ? '↑' : '↓';
  const pct = Math.abs(raw).toFixed(0);

  // Choose the comparison phrase key based on the window length.
  const compareKey =
    data.trend.length >= 60 ? 'hero.compareMonth' : data.trend.length >= 14 ? 'hero.compareWeek' : 'hero.comparePeriod';

  if (tone === 'faint') {
    if (perf === 'declining') return { kind: 'flatDown', metricLabelKey: star.label };
    return { kind: 'metricSteady', metricLabelKey: star.label, range };
  }

  return {
    kind: effective >= 0 ? 'metricUp' : 'metricDown',
    metricLabelKey: star.label,
    arrow,
    pct,
    compareKey,
    deltaTone: tone,
  };
}

// Tooltip payload type recharts gives us. Centralised so chart-shapes.tsx
// can import it without each component redeclaring.
export interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}
